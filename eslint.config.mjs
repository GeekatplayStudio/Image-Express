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
    "next-env.d.ts",
    // External reference repo cloned for analysis only:
    "Imageprocessingui/**",
  ]),
]);

export default eslintConfig;
