// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "*.js"],
  },
  {
    files: ["src/**/*.ts", "packages/*/src/**/*.ts", "apps/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      // Enforce explicit return types on public functions (warn to allow gradual adoption)
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      // Prevent accidental any
      "@typescript-eslint/no-explicit-any": "warn",
      // Unused vars must be prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // No floating promises
      "@typescript-eslint/no-floating-promises": "off", // enabled via tsconfig strict
      // Console output in CLI is intentional — warn only
      "no-console": "warn",
      // No direct process.exit — use throw instead (except CLI entry)
      "no-process-exit": "off",
    },
  },
  {
    // Relax rules for test files
    files: ["tests/**/*.ts", "packages/*/tests/**/*.ts", "apps/*/tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];
