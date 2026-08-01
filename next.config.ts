import type { NextConfig } from "next";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

type AppVersionMeta = {
  baseVersion: string;
  subversion: string;
  version: string;
  commit: string;
  dirty: string;
  buildTime: string;
};

function safeGit(command: string): string {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function resolveAppVersionMeta(): AppVersionMeta {
  let baseVersion = "0.0.0";
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
    if (typeof packageJson.version === "string" && packageJson.version.trim()) {
      baseVersion = packageJson.version.trim();
    }
  } catch {
    // Keep fallback base version.
  }

  const commitCount = safeGit("git rev-list --count HEAD");
  const subversion = commitCount || "0";
  const commit = safeGit("git rev-parse --short HEAD") || "nogit";
  const dirty = safeGit("git status --porcelain") ? "dirty" : "clean";
  const buildTime = new Date().toISOString();

  return {
    baseVersion,
    subversion,
    version: `${baseVersion}.${subversion}`,
    commit,
    dirty,
    buildTime,
  };
}

const appVersionMeta = resolveAppVersionMeta();

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the standalone trace lean: runtime data, local user assets, authoring
  // workspaces, and tooling must never ship inside the desktop build.
  //
  // This list matters more than it looks. `appPaths.ts` resolves runtime folders
  // from `process.cwd()`, which makes the tracer give up and pull in the whole
  // project root (Turbopack reports this as "Encountered unexpected file in NFT
  // list"). Anything not excluded here therefore ends up inside
  // `.next/standalone`, and `extraResources` copies that straight into the
  // installer — which is how previous `dist-*` builds and multi-GB asset
  // folders can end up nested inside the app.
  //
  // Rule of thumb: a new top-level folder that is not needed by the server at
  // runtime must be added here, and prior build output must stay excluded so
  // packages never nest inside each other.
  outputFileTracingExcludes: {
    "*": [
      // Prior build output — without these, each package embeds the last one.
      "./dist/**",
      "./dist-*/**",
      "./.next/cache/**",
      "./coverage/**",
      "./test-results/**",
      "./playwright-report/**",
      // Large local/authoring asset workspaces (never shipped).
      "./3d-models/**",
      "./Packs-Assets-NotInclude/**",
      "./public/assets/**",
      "./ComfyUI workflows/**",
      "./comfyui custom nodes/**",
      "./external/**",
      "./mobile-companion/**",
      "./Imageprocessingui/**",
      "./theme-packs/**",
      "./ambience-packs/**",
      "./data/**",
      "./logs/**",
      "./*.glb",
      "./*.gltf",
      "./*.fbx",
      "./*.obj",
      // Sources and tooling — the server runs the compiled output, not these.
      "./src/**",
      "./e2e/**",
      "./docs/**",
      "./scripts/**",
      "./electron/**",
      "./.claude/**",
      "./.agents/**",
      "./.cursor/**",
      "./.github/**",
      "./.vscode/**",
      "./.swc/**",
      "./.git/**",
      "./.vercel/**",
      "./node_modules/.cache/**",
      "./package-lock.json",
      "./Dockerfile",
      "./README.md",
      "./install.bat",
      "./install.command",
      "./start.bat",
      "./start.command",
      "./jest.config.ts",
      "./jest.setup.ts",
      "./playwright.config.ts",
      "./eslint.config.mjs",
      "./postcss.config.mjs",
      "./tsconfig.json",
      "./tsconfig.typecheck.json",
      "./i18n-export-*.json",
      "./*.log",
      "./*.tsbuildinfo",
    ],
  },
  env: {
    NEXT_PUBLIC_APP_BASE_VERSION: appVersionMeta.baseVersion,
    NEXT_PUBLIC_APP_SUBVERSION: appVersionMeta.subversion,
    NEXT_PUBLIC_APP_VERSION: appVersionMeta.version,
    NEXT_PUBLIC_APP_COMMIT: appVersionMeta.commit,
    NEXT_PUBLIC_APP_DIRTY: appVersionMeta.dirty,
    NEXT_PUBLIC_APP_BUILD_TIME: appVersionMeta.buildTime
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" }
    ]
  }
};

export default nextConfig;
