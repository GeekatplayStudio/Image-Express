import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use the themed Dialog/Toast providers instead of system alerts." },
        { name: "confirm", message: "Use the themed Dialog provider instead of system confirm dialogs." },
        { name: "prompt", message: "Use the themed Dialog provider instead of system prompt dialogs." }
      ],
      "@typescript-eslint/no-explicit-any": "error"
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "dist-*/**",
    "data/**",
    "external/**",
    "logs/**",
    "next-env.d.ts",
    // Build output is not source, wherever it lands. The bare ".next/**"
    // above only matches the repo root, so a build inside a git worktree
    // (".claude/worktrees/<name>/.next") was linted as if it were source:
    // 108,985 problems and minutes of runtime, which made `npm run lint`
    // unusable the moment anyone created a worktree.
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    ".claude/worktrees/**",
    // External reference repo cloned for analysis only:
    "Imageprocessingui/**",
    // Standalone Expo mobile companion app:
    "mobile-companion/**",
    // Pack authoring workspaces. Both are gitignored and untracked — packs are
    // downloadable data, not source, so they are not held to app lint rules.
    "theme-packs/**",
    "ambience-packs/**",
  ]),
]);

export default eslintConfig;
