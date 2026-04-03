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
