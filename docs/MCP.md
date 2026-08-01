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
- `install_theme_from_url` / `install_ambience_from_url` install packs that
  contain executable modules (see `docs/THEME_PACKS_SPEC.md` §11) — clients
  should only install packs from sources the user trusts.
- `delete_design` is irreversible; MCP clients surface tool calls for user
  approval, and the tool description tells the model to confirm first.
