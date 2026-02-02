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
      ]
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
