// shopping_items.food_id を foods マスタとのマッチング結果でバックフィルする。
//
// Phase 1 までは shopping_items.food_id を null のまま保存していたため、
// Phase 2 の栄養集計で必要になる紐付けを後付けで行うスクリプト。
//
// 使い方:
//   cd web && pnpm backfill:food-ids [--dry-run]
//
// 必要環境変数（web/scripts/.env から読込）:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// オプション:
//   --dry-run / FOODS_BACKFILL_DRYRUN=1   実 update せず統計のみ表示

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFoodIndex,
  matchFood,
  type FoodEntry,
} from "../lib/foods/matcher";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です。\n" +
      "web/scripts/.env に設定してください。",
  );
  process.exit(1);
}

const DRY_RUN =
  process.env.FOODS_BACKFILL_DRYRUN === "1" || process.argv.includes("--dry-run");

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. foods 一覧をロードして index 化
  const { data: foods, error: foodsErr } = await supabase
    .from("foods")
    .select("id, name, aliases");
  if (foodsErr) {
    console.error("Failed to load foods:", foodsErr);
    process.exit(1);
  }
  const index = buildFoodIndex((foods ?? []) as FoodEntry[]);
  console.log(`✓ Loaded ${foods?.length ?? 0} foods`);

  // 2. food_id が null の shopping_items を全件取得
  const { data: items, error: itemsErr } = await supabase
    .from("shopping_items")
    .select("id, raw_name, display_name")
    .is("food_id", null);
  if (itemsErr) {
    console.error("Failed to load shopping_items:", itemsErr);
    process.exit(1);
  }
  const total = items?.length ?? 0;
  console.log(`✓ Found ${total} unmatched items`);

  if (total === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // 3. マッチング結果を food_id 別にグルーピング（同一 food_id への update を 1 回にまとめる）
  const grouped = new Map<string, string[]>();
  const unmatchedNames = new Map<string, number>();

  for (const item of items as { id: string; raw_name: string; display_name: string | null }[]) {
    const foodId = matchFood(item.raw_name, item.display_name, index);
    if (foodId) {
      const cur = grouped.get(foodId) ?? [];
      cur.push(item.id);
      grouped.set(foodId, cur);
    } else {
      const key = item.display_name ?? item.raw_name;
      unmatchedNames.set(key, (unmatchedNames.get(key) ?? 0) + 1);
    }
  }

  const matchedCount = total - [...unmatchedNames.values()].reduce((a, b) => a + b, 0);
  const matchRate = total > 0 ? ((matchedCount / total) * 100).toFixed(1) : "0";
  console.log(`\nMatched:   ${matchedCount} / ${total} (${matchRate}%)`);
  console.log(`Unmatched: ${unmatchedNames.size} unique names`);

  if (unmatchedNames.size > 0) {
    const top = [...unmatchedNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    console.log("\nUnmatched (top 20 by frequency):");
    for (const [name, count] of top) {
      console.log(`  ${count.toString().padStart(3)} × ${name}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n(--dry-run) skipping actual UPDATE.");
    return;
  }

  // 4. 同じ food_id への update を batch 化して一括更新
  console.log(`\nUpdating ${grouped.size} food_id groups...`);
  let updated = 0;
  for (const [foodId, itemIds] of grouped.entries()) {
    const { error } = await supabase
      .from("shopping_items")
      .update({ food_id: foodId })
      .in("id", itemIds);
    if (error) {
      console.error(`  ✗ ${foodId} (${itemIds.length} items): ${error.message}`);
      continue;
    }
    updated += itemIds.length;
  }
  console.log(`\n✅ Done. updated ${updated} items.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
