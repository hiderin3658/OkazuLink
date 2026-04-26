// foods マスタ投入スクリプト
//
// 使い方:
//   cd web && pnpm seed:foods
//   （内部で tsx 経由で本ファイルを実行する）
//
// 必要環境変数（web/scripts/.env から読込）:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// オプション環境変数:
//   FOODS_SEED_LIMIT=10        小規模投入用（先頭 N 件のみ送る）
//   FOODS_SEED_DRYRUN=1        実際には upsert せず件数だけ表示する
//   FOODS_SEED_CHUNK=500       chunk サイズ調整（デフォルト 500）

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFoodSource } from "./parse-foods";
import type { RawFoodRow } from "./foods-mapping";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// web/scripts/.env を読む（無くてもプロセス環境変数があれば動く）
dotenv.config({ path: resolve(__dirname, ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。\n" +
      "web/scripts/.env に設定するか、環境変数で渡してください。",
  );
  process.exit(1);
}

const LIMIT = process.env.FOODS_SEED_LIMIT
  ? Number(process.env.FOODS_SEED_LIMIT)
  : undefined;
const DRY_RUN = process.env.FOODS_SEED_DRYRUN === "1";
const CHUNK_SIZE = Number(process.env.FOODS_SEED_CHUNK ?? 500);

async function main() {
  // データソースは supabase/scripts/data/ に維持（リポジトリ構成として seed 用データは
  // supabase/ 配下が直感的なため）。web/scripts/ はランタイム実行のみを担う。
  const dataPath = resolve(
    __dirname,
    "..",
    "..",
    "supabase",
    "scripts",
    "data",
    "foods-source.json",
  );
  const raw = JSON.parse(readFileSync(dataPath, "utf-8")) as RawFoodRow[];
  const parsed = parseFoodSource(raw);
  const target = LIMIT ? parsed.slice(0, LIMIT) : parsed;

  console.log(`Source rows:  ${raw.length}`);
  console.log(`Parsed rows:  ${parsed.length}`);
  console.log(`Target rows:  ${target.length}${LIMIT ? ` (LIMIT=${LIMIT})` : ""}`);
  console.log(`Chunk size:   ${CHUNK_SIZE}`);
  console.log(`Dry run:      ${DRY_RUN ? "YES" : "no"}`);

  if (DRY_RUN) {
    console.log("\nDry run mode — sample of first parsed row:");
    console.log(JSON.stringify(target[0], null, 2));
    return;
  }

  // service_role_key で RLS バイパス。クライアントには絶対渡さない。
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let totalUpserted = 0;
  for (let i = 0; i < target.length; i += CHUNK_SIZE) {
    const chunk = target.slice(i, i + CHUNK_SIZE);
    const { error, count } = await supabase
      .from("foods")
      .upsert(chunk, { onConflict: "code", count: "exact" });

    if (error) {
      console.error(`\n✗ chunk[${i}..${i + chunk.length}) failed:`, error);
      process.exit(1);
    }
    totalUpserted += count ?? chunk.length;
    console.log(`  ✓ ${i + chunk.length}/${target.length}`);
  }

  console.log(`\n✅ Done. upserted ${totalUpserted} rows.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
