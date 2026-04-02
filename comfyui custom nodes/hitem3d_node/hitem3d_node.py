import json
import os
import time
import uuid
from io import BytesIO
from typing import Dict, List, Optional, Tuple
from urllib import error as url_error
from urllib import parse as url_parse
from urllib import request as url_request

import folder_paths
import numpy as np
from PIL import Image


BASE_URL = "https://api.hitem3d.ai/open-api/v1"
CONFIG_FILENAME = "hitem3d_api_key.local.json"
TOKEN_TTL_SECONDS = 50 * 60

MODEL_OPTIONS = [
    "auto",
    "hitem3dv1.5",
    "hitem3dv2.0",
    "scene-portraitv1.5",
    "scene-portraitv2.0",
    "scene-portraitv2.1",
]

RESOLUTION_OPTIONS = ["512", "1024", "1536", "1536pro"]
FORMAT_OPTIONS = {
    "obj": "1",
    "glb": "2",
    "stl": "3",
    "fbx": "4",
    "usdz": "5",
}

MODEL_ALLOWED_RESOLUTIONS = {
    "hitem3dv1.5": ["512", "1024", "1536", "1536pro"],
    "hitem3dv2.0": ["1536", "1536pro"],
    "scene-portraitv1.5": ["1536"],
    "scene-portraitv2.0": ["1536pro"],
    "scene-portraitv2.1": ["1536pro"],
}

DEFAULT_MODEL_BY_TYPE = {
    "normal": "hitem3dv1.5",
    "portrait": "scene-portraitv2.1",
    "relief": "hitem3dv1.5",
}

# Model variants that do not support request_type=2 (texture stage)
TEXTURE_STAGE_UNSUPPORTED = {"hitem3dv2.0", "scene-portraitv2.0", "scene-portraitv2.1"}


class Hitem3DClientError(RuntimeError):
    pass


class Hitem3DComfyNode:
    _token_cache: Dict[str, Dict[str, object]] = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_1": ("IMAGE",),
                "generation_type": (["normal", "portrait", "relief"],),
                "hitem_model": (MODEL_OPTIONS,),
                "resolution": (RESOLUTION_OPTIONS,),
                "textured": ("BOOLEAN", {"default": True}),
                "output_format": (list(FORMAT_OPTIONS.keys()),),
                "output_folder": ("STRING", {"default": "hitem3d_outputs"}),
                "output_name": ("STRING", {"default": "hitem3d_model"}),
                "wait_for_result": ("BOOLEAN", {"default": True}),
                "max_wait_seconds": ("INT", {"default": 1200, "min": 60, "max": 7200, "step": 10}),
                "poll_interval_seconds": ("INT", {"default": 8, "min": 2, "max": 120, "step": 1}),
                "face": ("INT", {"default": 0, "min": 0, "max": 2000000, "step": 1000}),
                "mesh_url": ("STRING", {"default": ""}),
                "multi_images_bit": ("STRING", {"default": ""}),
            },
            "optional": {
                "image_2": ("IMAGE",),
                "image_3": ("IMAGE",),
                "image_4": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT")
    RETURN_NAMES = ("saved_model_path", "download_url", "task_id", "status_code")
    FUNCTION = "run"
    CATEGORY = "Hitem3D"

    def run(
        self,
        image_1,
        generation_type,
        hitem_model,
        resolution,
        textured,
        output_format,
        output_folder,
        output_name,
        wait_for_result,
        max_wait_seconds,
        poll_interval_seconds,
        face,
        mesh_url,
        multi_images_bit,
        image_2=None,
        image_3=None,
        image_4=None,
    ):
        config = self._load_config()
        api_key = str(config.get("api_key", "")).strip()
        app_id = str(config.get("app_id", "")).strip()
        timeout_seconds = int(config.get("timeout_seconds", max_wait_seconds))
        poll_seconds = int(config.get("poll_interval_seconds", poll_interval_seconds))

        if not api_key:
            raise Hitem3DClientError(
                f"Missing api_key in {CONFIG_FILENAME}. Edit the local config file and retry."
            )

        selected_model = self._resolve_model(generation_type, hitem_model)
        selected_resolution = self._resolve_resolution(selected_model, resolution)
        request_type = self._resolve_request_type(selected_model, generation_type, textured)
        fmt_value = FORMAT_OPTIONS[output_format]

        normalized_face = self._normalize_face(face)
        normalized_mesh_url = str(mesh_url or "").strip()
        if request_type == "2" and not normalized_mesh_url:
            raise Hitem3DClientError("mesh_url is required when request_type is texture stage (2).")

        images = [image_1, image_2, image_3, image_4]
        image_payload = self._collect_images(images)
        if len(image_payload) == 0:
            raise Hitem3DClientError("At least one image is required.")
        if len(image_payload) > 4:
            raise Hitem3DClientError("This node supports up to 4 input images.")

        headers = self._build_auth_headers(api_key, app_id)
        form_fields = {
            "request_type": request_type,
            "model": selected_model,
            "resolution": selected_resolution,
            "format": fmt_value,
        }
        if normalized_face:
            form_fields["face"] = normalized_face
        if normalized_mesh_url:
            form_fields["mesh_url"] = normalized_mesh_url
        if str(multi_images_bit or "").strip():
            form_fields["multi_images_bit"] = str(multi_images_bit).strip()

        image_field_name = "multi_images" if len(image_payload) > 1 else "images"
        submit_response = self._submit_task(headers, form_fields, image_payload, image_field_name)
        task_id = self._extract_task_id(submit_response)

        if not wait_for_result:
            return ("", "", task_id, 202)

        wait_limit = max(30, min(timeout_seconds, max_wait_seconds))
        poll_delay = max(2, poll_seconds)
        query_response = self._poll_until_ready(headers, task_id, wait_limit, poll_delay)
        model_url = self._extract_model_url(query_response)

        saved_path = self._download_model(
            model_url=model_url,
            output_folder=output_folder,
            output_name=output_name,
            extension=output_format,
        )

        return (saved_path, model_url, task_id, 200)

    def _load_config(self) -> Dict[str, object]:
        config_path = os.path.join(os.path.dirname(__file__), CONFIG_FILENAME)
        if not os.path.exists(config_path):
            raise Hitem3DClientError(
                f"Config file not found: {config_path}. Create it from hitem3d_api_key.example.json"
            )

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as exc:
            raise Hitem3DClientError(f"Failed reading {CONFIG_FILENAME}: {exc}") from exc

        if not isinstance(payload, dict):
            raise Hitem3DClientError(f"{CONFIG_FILENAME} must contain a JSON object.")
        return payload

    def _resolve_model(self, generation_type: str, hitem_model: str) -> str:
        if hitem_model != "auto":
            return hitem_model
        return DEFAULT_MODEL_BY_TYPE[generation_type]

    def _resolve_resolution(self, model: str, resolution: str) -> str:
        allowed = MODEL_ALLOWED_RESOLUTIONS.get(model, ["1024"])
        if resolution in allowed:
            return resolution
        return allowed[0]

    def _resolve_request_type(self, model: str, generation_type: str, textured: bool) -> str:
        if generation_type == "relief":
            return "1"
        if not textured:
            return "1"
        if model in TEXTURE_STAGE_UNSUPPORTED:
            return "3"
        return "3"

    def _normalize_face(self, face: int) -> str:
        if face <= 0:
            return ""
        if face < 100000:
            return "100000"
        if face > 2000000:
            return "2000000"
        return str(face)

    def _collect_images(self, images: List[object]) -> List[Tuple[str, bytes, str]]:
        payload: List[Tuple[str, bytes, str]] = []
        index = 1
        for image in images:
            if image is None:
                continue
            image_bytes, mime_type = self._tensor_to_png_bytes(image)
            payload.append((f"image_{index}.png", image_bytes, mime_type))
            index += 1
        return payload

    def _tensor_to_png_bytes(self, image_tensor) -> Tuple[bytes, str]:
        # Comfy IMAGE tensors are BHWC in [0..1]. We use the first item if batched.
        arr = image_tensor
        if hasattr(arr, "shape") and len(arr.shape) == 4:
            arr = arr[0]
        np_img = arr.cpu().numpy() if hasattr(arr, "cpu") else np.array(arr)
        np_img = np.clip(np_img, 0.0, 1.0)
        np_img = (np_img * 255.0).astype(np.uint8)

        if np_img.ndim == 2:
            pil_img = Image.fromarray(np_img, mode="L")
        else:
            if np_img.shape[-1] == 4:
                pil_img = Image.fromarray(np_img, mode="RGBA")
            else:
                pil_img = Image.fromarray(np_img[:, :, :3], mode="RGB")

        stream = BytesIO()
        pil_img.save(stream, format="PNG")
        return stream.getvalue(), "image/png"

    def _build_auth_headers(self, api_key: str, app_id: str) -> Dict[str, str]:
        auth = self._resolve_authorization(api_key)
        headers = {
            "Authorization": auth,
            "Accept": "application/json",
        }
        if app_id:
            headers["Appid"] = app_id
        return headers

    def _resolve_authorization(self, raw_api_key: str) -> str:
        value = raw_api_key.strip()
        if not value:
            raise Hitem3DClientError("api_key is empty.")

        lowered = value.lower()
        if lowered.startswith("bearer "):
            return value
        if lowered.startswith("basic "):
            return self._token_from_basic(value)
        if ":" in value:
            basic = self._to_basic(value)
            return self._token_from_basic(basic)
        return f"Bearer {value}"

    def _to_basic(self, client_pair: str) -> str:
        import base64

        encoded = base64.b64encode(client_pair.encode("utf-8")).decode("ascii")
        return f"Basic {encoded}"

    def _token_from_basic(self, basic_header: str) -> str:
        cached = self._token_cache.get(basic_header)
        now = time.time()
        if cached and isinstance(cached.get("fetched_at"), (int, float)):
            if now - float(cached["fetched_at"]) < TOKEN_TTL_SECONDS:
                token_type = str(cached.get("token_type", "Bearer"))
                token = str(cached.get("token", ""))
                if token:
                    return f"{token_type} {token}"

        token_response = self._http_json(
            method="POST",
            url=f"{BASE_URL}/auth/token",
            headers={
                "Authorization": basic_header,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body_bytes=b"{}",
            expect_json=True,
        )

        token = self._extract_token(token_response)
        token_type = self._extract_token_type(token_response)
        self._token_cache[basic_header] = {
            "token": token,
            "token_type": token_type,
            "fetched_at": now,
        }
        return f"{token_type} {token}"

    def _extract_token(self, payload: Dict[str, object]) -> str:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        candidates = [
            payload.get("accessToken"),
            payload.get("access_token"),
            payload.get("token"),
            data.get("accessToken") if isinstance(data, dict) else None,
            data.get("access_token") if isinstance(data, dict) else None,
            data.get("token") if isinstance(data, dict) else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        raise Hitem3DClientError("Hitem token response did not include access token.")

    def _extract_token_type(self, payload: Dict[str, object]) -> str:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        candidates = [
            payload.get("tokenType"),
            payload.get("token_type"),
            data.get("tokenType") if isinstance(data, dict) else None,
            data.get("token_type") if isinstance(data, dict) else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return "Bearer"

    def _submit_task(
        self,
        headers: Dict[str, str],
        fields: Dict[str, str],
        images: List[Tuple[str, bytes, str]],
        image_field_name: str,
    ) -> Dict[str, object]:
        body, content_type = self._encode_multipart(fields, image_field_name, images)
        submit_headers = dict(headers)
        submit_headers["Content-Type"] = content_type
        return self._http_json(
            method="POST",
            url=f"{BASE_URL}/submit-task",
            headers=submit_headers,
            body_bytes=body,
            expect_json=True,
        )

    def _encode_multipart(
        self,
        fields: Dict[str, str],
        image_field_name: str,
        images: List[Tuple[str, bytes, str]],
    ) -> Tuple[bytes, str]:
        boundary = f"----ComfyHitem3D{uuid.uuid4().hex}"
        chunks: List[bytes] = []

        for key, value in fields.items():
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
            chunks.append(f"{value}\r\n".encode("utf-8"))

        for filename, data, mime in images:
            safe_mime = mime or "application/octet-stream"
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(
                (
                    f'Content-Disposition: form-data; name="{image_field_name}"; '
                    f'filename="{filename}"\r\n'
                ).encode("utf-8")
            )
            chunks.append(f"Content-Type: {safe_mime}\r\n\r\n".encode("utf-8"))
            chunks.append(data)
            chunks.append(b"\r\n")

        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
        return b"".join(chunks), f"multipart/form-data; boundary={boundary}"

    def _extract_task_id(self, payload: Dict[str, object]) -> str:
        if isinstance(payload.get("task_id"), str) and str(payload["task_id"]).strip():
            return str(payload["task_id"]).strip()
        data = payload.get("data")
        if isinstance(data, dict):
            task_id = data.get("task_id")
            if isinstance(task_id, str) and task_id.strip():
                return task_id.strip()
        raise Hitem3DClientError(f"Hitem submit-task response missing task_id: {payload}")

    def _poll_until_ready(
        self,
        headers: Dict[str, str],
        task_id: str,
        max_wait_seconds: int,
        poll_interval_seconds: int,
    ) -> Dict[str, object]:
        start = time.time()
        last_payload: Dict[str, object] = {}

        while True:
            query_url = f"{BASE_URL}/query-task?{url_parse.urlencode({'task_id': task_id})}"
            payload = self._http_json(
                method="GET",
                url=query_url,
                headers=headers,
                body_bytes=None,
                expect_json=True,
            )
            last_payload = payload

            data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
            if isinstance(data, dict):
                if self._extract_model_url(payload, allow_missing=True):
                    return payload

                status_tokens = [
                    str(payload.get("status", "")).lower(),
                    str(payload.get("msg", "")).lower(),
                    str(data.get("status", "")).lower(),
                    str(data.get("task_status", "")).lower(),
                    str(data.get("task_msg", "")).lower(),
                ]
                joined = " | ".join(token for token in status_tokens if token)
                if any(token in joined for token in ["fail", "error", "invalid", "denied", "forbidden"]):
                    raise Hitem3DClientError(f"Hitem task failed for task_id={task_id}: {payload}")

            elapsed = time.time() - start
            if elapsed >= max_wait_seconds:
                raise Hitem3DClientError(
                    f"Timed out waiting for Hitem task {task_id}. Last response: {last_payload}"
                )
            time.sleep(poll_interval_seconds)

    def _extract_model_url(self, payload: Dict[str, object], allow_missing: bool = False) -> str:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        candidates = [
            payload.get("url"),
            payload.get("model_url"),
            data.get("url") if isinstance(data, dict) else None,
            data.get("model_url") if isinstance(data, dict) else None,
            data.get("download_url") if isinstance(data, dict) else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()

        if allow_missing:
            return ""
        raise Hitem3DClientError(f"Hitem query-task response missing model URL: {payload}")

    def _download_model(self, model_url: str, output_folder: str, output_name: str, extension: str) -> str:
        base_output = folder_paths.get_output_directory()
        safe_folder = str(output_folder or "hitem3d_outputs").strip().replace("..", "_")
        folder_path = os.path.join(base_output, safe_folder)
        os.makedirs(folder_path, exist_ok=True)

        safe_name = (str(output_name or "hitem3d_model").strip() or "hitem3d_model").replace(" ", "_")
        filename = f"{safe_name}.{extension}"
        full_path = os.path.join(folder_path, filename)

        try:
            req = url_request.Request(model_url, method="GET")
            with url_request.urlopen(req, timeout=180) as resp:
                data = resp.read()
        except Exception as exc:
            raise Hitem3DClientError(f"Failed to download generated model: {exc}") from exc

        with open(full_path, "wb") as f:
            f.write(data)
        return full_path

    def _http_json(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body_bytes: Optional[bytes],
        expect_json: bool,
    ) -> Dict[str, object]:
        req = url_request.Request(url=url, data=body_bytes, method=method)
        for key, value in headers.items():
            req.add_header(key, value)

        try:
            with url_request.urlopen(req, timeout=240) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                status = int(resp.status)
        except url_error.HTTPError as http_err:
            raw = http_err.read().decode("utf-8", errors="replace") if http_err.fp else ""
            status = int(http_err.code)
            self._raise_http_error(status, raw, url)
        except Exception as exc:
            raise Hitem3DClientError(f"Request failed for {url}: {exc}") from exc

        payload: Dict[str, object]
        if raw.strip():
            try:
                loaded = json.loads(raw)
            except json.JSONDecodeError:
                if expect_json:
                    raise Hitem3DClientError(f"Invalid JSON response from {url}: {raw[:400]}")
                loaded = {"raw": raw}
            if isinstance(loaded, dict):
                payload = loaded
            else:
                payload = {"data": loaded}
        else:
            payload = {}

        if status >= 400:
            self._raise_http_error(status, raw, url)

        code = payload.get("code")
        if code not in (None, 0, 200, "0", "200"):
            msg = payload.get("msg") or payload.get("message") or "Unknown Hitem API error"
            raise Hitem3DClientError(f"Hitem API error for {url}: code={code}, message={msg}")

        return payload

    def _raise_http_error(self, status: int, raw: str, url: str):
        detail = ""
        if raw.strip():
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    detail = str(parsed.get("msg") or parsed.get("message") or parsed.get("detail") or raw)
                else:
                    detail = raw
            except Exception:
                detail = raw
        else:
            detail = "(empty response body)"

        raise Hitem3DClientError(f"HTTP {status} from {url}: {detail[:600]}")


NODE_CLASS_MAPPINGS = {
    "Hitem3DGenerateModel": Hitem3DComfyNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Hitem3DGenerateModel": "Hitem3D Generate Model (1-4 Images)",
}
