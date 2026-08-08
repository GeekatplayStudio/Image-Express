# MCP Support (Model Context Protocol)

Image Express ships an MCP server that exposes the app's local HTTP API as
tools, so MCP clients — Claude Desktop, Claude Code, or any other MCP-capable
agent — can drive the app: browse and manage the design library, import
assets, install theme/ambience packs, and queue AI image generation.

The server is a thin stdio bridge in [`scripts/mcp-server.mjs`](../scripts/mcp-server.mjs).
**The app itself must already be running** (web dev/prod or the desktop app);
the MCP server does not start it.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `IMAGE_EXPRESS_URL` | `http://localhost:3457` | Base URL of the running app. The desktop app uses port `3927`. |
| `IMAGE_EXPRESS_API_TOKEN` | *(auto)* | Normally unset — the bridge finds the token the app wrote. Set it only if your data directory is somewhere unusual. |
| `IMAGE_EXPRESS_MCP_ALLOW_DESTRUCTIVE` | unset | Set to `1` to expose the three delete tools. **They are not registered at all by default.** |

### Authentication

The app writes a random token to `local-api-token` in its data directory on
startup, and the bridge sends it as `Authorization: Bearer …` on every call.

This is not a password, and it is not protection against local malware — any
process that can read that file could already read the design files and the
encrypted key vault sitting next to it. What it buys is the ability for the
server to tell an **authorised local tool** apart from an unauthenticated
caller, which is what makes it safe to refuse the latter on routes that delete
or install.

If the bridge reports that no token was found, start the app once so it can
create one.

### Destructive tools are opt-in

`delete_design`, `delete_brand_profile` and `delete_super_agent` are **not
registered** unless `IMAGE_EXPRESS_MCP_ALLOW_DESTRUCTIVE=1`. Eighteen of the
twenty-one tools are available by default.

Not registering is deliberately stronger than warning in the tool description: a
capability that is absent cannot be reached by a confused model, by a prompt
injection in a page the model read, or by a mis-click on an approval dialog.

### Tool annotations

Every tool carries standard MCP annotations, so a client can decide when to ask
before running one:

| Annotation | Tools |
|---|---|
| `readOnlyHint` | The 8 `list_*` / `get_*` / `app_status` tools |
| `destructiveHint` | The 3 delete tools (opt-in only) |
| `openWorldHint` | `import_asset_from_url`, `install_theme_from_url`, `install_ambience_from_url` — these fetch an address the caller supplies |

## Connecting a client

### Claude Code

```sh
claude mcp add image-express -- node <path-to-repo>/scripts/mcp-server.mjs
# desktop app on port 3927:
claude mcp add image-express -e IMAGE_EXPRESS_URL=http://localhost:3927 -- node <path-to-repo>/scripts/mcp-server.mjs
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "image-express": {
      "command": "node",
      "args": ["<path-to-repo>/scripts/mcp-server.mjs"],
      "env": { "IMAGE_EXPRESS_URL": "http://localhost:3457" }
    }
  }
}
```

### Any other MCP client

Launch `node scripts/mcp-server.mjs` over stdio (`npm run mcp` also works).
The server speaks standard MCP JSON-RPC (SDK `@modelcontextprotocol/sdk`).

## Tools

| Tool | What it does |
|---|---|
| `app_status` | Reachability check + library counts (designs, templates, themes, ambience) |
| `list_designs` | Saved designs with id, name, thumbnail, last-modified |
| `rename_design` | Rename a design by id |
| `delete_design` | Permanently delete a design (irreversible — clients should confirm) |
| `list_templates` | Saved design templates |
| `list_assets` | Uploaded media assets |
| `import_asset_from_url` | Download an image URL into the asset library |
| `list_themes` | Installed UI theme packs (flags animated ones) |
| `install_theme_from_url` | Install a theme pack zip from a URL |
| `list_ambience_packs` | Installed dashboard ambience packs |
| `install_ambience_from_url` | Install an ambience pack zip from a URL |
| `generate_image` | Queue an AI image generation job (e.g. via local ComfyUI) |
| `get_brand_profile` | Fetch active Brand Kit profile guidelines (palette, typography, logo layout rules) |
| `save_brand_profile` | Create or update a Brand Kit profile (becomes the active profile) |
| `set_active_brand_profile` | Switch the active Brand Kit profile |
| `delete_brand_profile` | Delete a saved Brand Kit profile |
| `delete_super_agent` | Delete a custom sub-agent definition |
| `audit_brand_compliance` | Run a VLM or heuristic brand compliance audit on canvas state |
| `list_super_agents` | List active Super Agent and sub-agent definitions |
| `create_super_agent` | Register a custom specialized sub-agent |
| `execute_super_agent_task` | Generate a multi-step design execution plan for a prompt |

## Security notes

- The server only talks to `IMAGE_EXPRESS_URL` — by default the local app.
  It exposes no network listener of its own (stdio only).
- Requests carry the local API token (see **Authentication** above), so the app
  can distinguish this bridge from an unauthenticated caller.
- Routes that delete or install refuse requests driven by another origin. The
  server listens on localhost, so any page in a browser can reach it; a
  cross-site POST cannot read the reply but its side effect would still happen.
  `Sec-Fetch-Site` is set by the browser and cannot be forged by a page.
- Requests must be sent as `application/json`. That is a CSRF defence, not a
  formality: a cross-origin POST carrying `text/plain` is a *simple* request
  that browsers deliver without a preflight.
- `install_theme_from_url` / `install_ambience_from_url` install packs that
  contain executable modules (see `docs/THEME_PACKS_SPEC.md` §11) — clients
  should only install packs from sources the user trusts.
- `delete_design` is irreversible; MCP clients surface tool calls for user
  approval, and the tool description tells the model to confirm first.
