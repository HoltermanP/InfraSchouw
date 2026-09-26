import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@next/next/no-img-element": "off",
    },
  },
  {
    // react-pdf <Image> is not an HTML image (no alt attribute exists).
    files: ["src/lib/export/pdf.tsx"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
    "src/db/migrations/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
