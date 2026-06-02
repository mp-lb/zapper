import { createBaseEslintConfig } from "@mp-lb/fssstack-config/eslint";

export default [
  ...createBaseEslintConfig({
    tsconfigRootDir: import.meta.dirname,
    ignores: [
      "**/.zap/**",
      "apps/landing-page/**",
      "apps/docs/**",
      "apps/macos/**",
      "docs/**",
      "infra/**",
      "**/test-fixtures/**",
      // e2e suite runs in a separate VM harness and isn't part of the build
      // tsconfig, so type-aware linting can't resolve it.
      "packages/cli/tests/**",
      "**/vitest.e2e.config.ts",
      // build/dev tooling scripts, run via tsx/node and not part of the build tsconfig
      "**/scripts/**",
    ],
  }),
  {
    rules: {
      // The CLI intentionally keeps both `src/types.ts` (service/action types,
      // re-exported via the utils barrel) and `src/types/index.ts` (runtime
      // Context types). The explicit `../types/index` path is load-bearing —
      // it disambiguates the directory barrel from the sibling file — so the
      // "useless path segment" rewrite is wrong here.
      "import/no-useless-path-segments": "off",
    },
  },
];
