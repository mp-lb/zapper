import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../etc/vitest.node.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
    },
  }),
);
