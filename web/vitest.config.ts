import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // web/ 配下に加え、supabase/functions/ 配下の純粋関数テストも拾う。
    // Edge Function 本体（hello/index.ts や extract-receipt/index.ts 等）は
    // Deno 専用 API を使うため対象外（テストファイルとして書かない）。
    include: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "../supabase/functions/**/*.test.ts",
    ],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
