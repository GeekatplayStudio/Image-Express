# Image Express - Open Source AI Design Studio

Image Express is a professional content creation platform built with Next.js 16, TypeScript, Tailwind CSS, and Fabric.js. It seamlessly integrates 2D design with AI-powered 3D model generation.

**Open Source Project by [GeekatplayStudio](https://github.com/GeekatplayStudio)**

## 🌟 Connect with Us

- **GitHub Repository**: [GeekatplayStudio](https://github.com/GeekatplayStudio)
- **LinkedIn**: [Geekatplay](https://www.linkedin.com/in/geekatplay/)
- **YouTube (English)**: [@geekatplay](https://www.youtube.com/@geekatplay)
- **YouTube (Russian)**: [@geekatplay-ru](https://www.youtube.com/@geekatplay-ru)
- **Website**: [Geekatplay.com](https://www.geekatplay.com)
- **Photography**: [ChopinePhotography.com](https://www.chopinephotography.com)

## 🚀 Key Features

### Studio & Design
- **Modern Dashboard**: Redesigned home screen with quick-start templates (Instagram, YouTube, A4), recent designs grid, and community support links.
- **Infinite Canvas**: Advanced vector workspace using Fabric.js.
- **Layer Management**: Professional locking, visibility, reordering, multi-select, and folder organization with a cleaner action strip, selected-layer inspector toggle (X/Y/W/H), and explicit Arrange Layers mode.
- **Paint Folders**: Each paint session is grouped into a single folder; switching tools starts a new paint folder automatically.
- **Advanced Masking**: Non-destructive masking functionality. Select two objects to mask the bottom one with the top one; includes support for inverting masks.
- **Interactive Tools**: Gradient editor, expanded shapes (including cloud/thought bubble/hexagon/diamond), and text manipulation with multiline text editing in properties.
- **Retouching Suite**: Comprehensive canvas manipulation tools including Spot Healing, Remove, Clone Stamp, Blur, Sharpen, Dodge, Burn, Sponge, and History Brush.
- **Export Options**: Export designs to PNG, JPG, SVG, PDF, JSON, and self-contained HTML bundles with all assets rewritten for offline playback.
- **In-App Manual**: Contextual help modal with persistent chapter navigation and quick close actions.
- **Workspace Crop & Picker Reliability**:
  - Crop supports direct drag-draft selection in canvas workspace and apply-from-top controls.
  - Eyedropper samples from clicked canvas points without switching layer selection state.
  - Picker launches an expanded color wheel panel with harmony modes (complementary/triadic/tetradic/etc.) and saved swatches.

### AI Capabilities
- **Advanced 3D Generation**: 
  - Integrated **Meshy**, **Tripo**, and **Hitem3D** AI for high-quality 3D models.
  - **Interactive 3D Layer Editor**: Rotate, pan, and arrange 3D models seamlessly on the canvas with customizable environment lighting, shadows, and resolution.
  - **Textured Models**: Enforced PBR texture generation for realistic results.
  - **Background Processing**: Robust polling system for long-running AI tasks.
- **Image Generation**: Provider-routed generation via ComfyUI, Stability, and OpenAI pathways.
- **Local AI Critique with Ollama**:
   - Persist local runtime settings for Ollama base URL and preferred model in Settings.
   - Run local critique against either the selected layer or the full canvas from the toolbar.
   - Validate local model availability before sending critique requests.
- **ComfyUI Workflow Library & Proxying**:
   - Browse runnable server templates plus custom workflow-folder JSON imports from the app.
   - Inspect and manage configured Comfy custom-node/workflow repositories.
   - Use a same-origin Comfy proxy with loopback fallback handling for Docker/host setups.
- **AI Edit Notes (Beta)**:
   - Create a reference layer directly from the currently selected canvas layer.
   - Annotate with a large notes workspace using point/manual notes.
   - Remove point notes quickly with right-click and restore with Undo.
   - Save a flattened reference-notes layer back to canvas with embedded instruction metadata (`aiEditPlanData`) for downstream ComfyUI handoff.
   - Long-running jobs support manual abort and extended wait windows for heavy Comfy/Flux runs.
   - Comfy recovery now supports explicit cancellation and avoids auto-resuming canceled prompt IDs.
   - Aspect controls support a free custom primary value with model-adapted sizing guidance for render-time bucket alignment.

### Storage & Management
- **Server-Side Design Storage**: Designs are saved securely on the server (via filesystem in this edition), bypassing browser storage limits.
- **Asset Library**: 
  - Upload, organize, and manage images and 3D models.
  - **3D Previews**: Hover over any 3D model asset to see a real-time rotating 3D preview popup.
  - **Renaming System**: Interactive renaming overlay for assets.
- **Authentication**: Secure login system with server-side key persistence for API access.
- **Session Security**: Automatic 30-minute inactivity timeout for guest and web users to protect sessions.
- **Audit Logging**: Automatic login activity logging with IP and user agent; viewable from Settings.
- **Desktop Shell**: Single-codebase Electron build with auto-update checks and in-app update prompts.
- **Optional Drive Backup**: One-click Google Drive integration to mirror saved designs into your personal Drive folder.

## 🚀 Deployment

### Quick Start (Local)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open the app**:
   Visit [http://localhost:3000](http://localhost:3000) (or port 3001 if 3000 is busy).

### Desktop App (macOS & Windows)

Run Image Express as a standalone desktop application without manual login on localhost.

1. **Install dependencies** (once):
   ```bash
   npm install
   ```
2. **Desktop development mode** (hot reload for both Next.js and Electron):
   ```bash
   npm run desktop:dev
   ```
3. **Desktop production preview** (build + serve the desktop shell):
   ```bash
   npm run desktop:start
   ```
   This command runs `next build`, boots the standalone Next.js server on port 3927, and launches Electron.
4. **Create installers** (macOS DMG, Windows NSIS, Linux AppImage):
   ```bash
   npm run desktop:build
   ```

Inside the packaged app the Settings modal exposes “Desktop Updates” so users can manually check for new releases. Automatic checks run shortly after startup and every six hours; when an update finishes downloading the modal offers a restart button to install it.

### 🔑 API Key Configuration

To unlock full AI capabilities, you need to configure your API keys in the **Settings** menu. Keys are stored locally in your browser for security.

1. **Open Settings**: Click the gear icon in the top-right corner of the Hub or Editor.
2. **Navigate to API Keys**: Select the relevant tab (3D Services or Image Services).
3. **Enter Keys**: Paste your keys and click Save.

#### Supported Services:

**3D Generation (Text-to-3D):**
- **[Meshy AI](https://www.meshy.ai/)**: Get your key from the Meshy Dashboard.
- **[Tripo AI](https://www.tripo3d.ai/)**: Sign up and generate an API key.
- **[Hy3D / Hitems](https://www.hitems.com/)**: Professional text-to-3D service. Supports either bearer token or `access_key:secret_key`. `hitems_appid` is optional and only required for some accounts.

**2D Generation (Text-to-Image):**
- **[Stability AI](https://platform.stability.ai/)**: For Stable Diffusion generation.
- **[OpenAI](https://platform.openai.com/)**: For DALL-E 3 integration.

### Provider Key Validation (Settings)

The Settings modal now includes built-in key validation before generation:

- **Hitem3D**: server-side validation through `/api/ai/hitems/validate`.
- **Meshy / Tripo / Google**: local preflight format checks to catch obvious key mistakes early.

For Hitem3D, use **AK/SK mode** with `ak_...` + `sk_...` or **Token mode** with a bearer token. Successful Hitem validation stores normalized values for immediate use by the generator.

### Optional: Google Drive Backups

Keep a personal copy of every saved design in your Google Drive without exposing your credentials to the server.

1. Create an OAuth **Web application** in Google Cloud Console and note the **Client ID**.
2. Add the authorized JavaScript origins that match your dev/prod domains (e.g., `http://localhost:3000`).
3. Either set the environment variable before starting the app _or_ paste the Client ID directly into the Settings modal:
   ```bash
   export NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   ```
   Creating a `.env.local` works too; if omitted, you can paste the ID into **Settings → Google Drive Backup** and it will be stored locally.
4. Google login reuses the same stored Client ID. In Docker or other production builds where `NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID` is not baked into the image, the login modal will use the Client ID saved in Settings.
5. Run the app and open **Settings → Google Drive Backup → Connect** to approve access.
6. After connecting, every successful save keeps the local copy and uploads a JSON snapshot (with thumbnail metadata) to the `Image Express Backups` folder in your Drive.

### Docker Deployment

This project includes a `Dockerfile` optimized for production.

1. **Build**: 
   ```bash
   docker build -t image-express .
   ```
2. **Run**: 
   ```bash
   docker run -p 3000:3000 image-express
   ```

For local ComfyUI folder management inside Docker, mount your Comfy install, `custom_nodes` folder, and optional workflow-library folder into the container. If ComfyUI itself runs on the host machine, prefer `host.docker.internal` over `localhost` for server-side template scans.

## 🏗 Project Structure

- **`src/app`**:
  - `page.tsx`: Main layout handling views (Dashboard vs Editor).
  - `api/`: Backend routes for AI proxies, assets, and **design persistence**.
    - `api/designs/`: Endpoints for saving, listing, and deleting designs server-side.
- **`src/components`**:
  - `Dashboard.tsx`: Template selector and home view.
  - `DesignCanvas.tsx`: Core Fabric.js workspace.
  - `ThreeDGenerator.tsx`: AI integration panel.
  - `PropertiesPanel.tsx`: Context-aware editing sidebar.
  - `properties/`: Modular property editors (Shadow, Stroke, Text, Filters, etc.)

## 🎨 Properties Panel Features

The Properties Panel provides comprehensive editing capabilities:

### Adjustment Layers
- **Curves**: Spline-based color correction with per-channel control
- **Levels**: Black/Mid/White point adjustment
- **Exposure**: Brightness and contrast control
- **Hue/Saturation**: Color shift and intensity
- **Brightness/Contrast**: Dedicated tonal sliders
- **Color Balance**: RGB channel balancing with preserve-luminosity support
- **Light and Color**: Unified temperature/tint/exposure/saturation/vibrance control
- **Solid Color**: Blend-based color fill adjustment layer
- **Black & White**: Grayscale conversion

### Color & Swatches
- **Right Panel Color Wheel**: Embedded color wheel in properties color panel with live preview behavior
- **Channel Editing Modes**: Editable RGB / HSB / CMYK / Lab value cards
- **Profile Preview Modes**: sRGB, Adobe RGB, and CMYK print-preview context
- **Harmony Sets**: Save, rename, delete, import, and export harmony palettes
- **Grouped Swatches**: Create, select, and remove swatch groups directly in the Swatches panel, plus add/remove swatches per group
- **Mask Gradient Controls**: Clip-path masks support non-destructive linear or radial opacity fades with editable angle/start/end opacity.

### Shadow & Stroke
- **Drop Shadow**: Blur (0-150px), Offset (±200px), Opacity, Blend Modes
- **Inside Stroke**: Renders over fill
- **Outside Border**: Renders under fill (paintFirst: stroke)

### Text Tools
- **Curved Text**: Quadratic/Cubic bezier paths with presets (Flat, Arc↑, Arc↓, Circle)
- **13 Font Families**: Arial, Times New Roman, Georgia, Impact, and more
- **Font Weights**: 100-900 plus normal/bold

### Paint Mode
- **Brush Types**: Pencil, Spray, Oil, Watercolor
- **Blend Modes**: Normal, Multiply, Screen, Overlay
- **Smart Grouping**: Strokes auto-grouped in Paint Folders

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Graphics**: Fabric.js (2D), Three.js / React Three Fiber (3D)
- **Icons**: Lucide React

## 📚 Documentation

- Easy install guide (PC/Mac + optional ComfyUI/Ollama): [docs/INSTALLATION.md](docs/INSTALLATION.md)
- HTML export details, asset coverage, and QA guidance: [docs/html-export-notes.md](docs/html-export-notes.md)
- Current implementation status and handoff checkpoint: [docs/unified_progress_status.md](docs/unified_progress_status.md)
- Editor ownership map for ongoing refactors: [docs/component_responsibility_map.md](docs/component_responsibility_map.md)
- Current large-component audit and extraction plan: [docs/refactor_component_audit_2026-02-26.md](docs/refactor_component_audit_2026-02-26.md)
- Latest release notes (Apr 1 2026): [docs/release_notes_2026-04-01.md](docs/release_notes_2026-04-01.md)

Validation status as of 2026-04-01:
- `npm.cmd test -- --runInBand --ci` -> 57/57 suites passed
- `npm.cmd run build` -> passed
- `npm.cmd run lint -- .` -> passed with existing warnings only

## Editor Refactor Status

- `src/components/Editor/EditorView.tsx` has been reduced from 7,453 lines to 1,337 lines through progressive hook and component extraction.
- Header, menu, overlay, workspace shell, workspace canvas, panel shell, export support, selection interactions, retouch interactions, and shell side-effects are now owned by dedicated modules under `src/components/Editor/`.
- The canonical refactor handoff documents are:
  - `docs/component_responsibility_map.md`
  - `docs/refactor_component_audit_2026-02-26.md`
  - `docs/feature_implementation_tracker.md`
  - `docs/unified_progress_status.md`
