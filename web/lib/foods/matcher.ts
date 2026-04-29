// 食材名（raw_name / display_name）から foods マスタの ID を引く純粋関数群。
//
// Phase 2 の栄養集計で必須となるマッチングロジック。
// 戦略:
//   1. 完全一致 (foods.name または foods.aliases に含まれる)
//   2. 正規化（NFKC + ひら→カナ + lowercase + 空白除去）後の一致
//   3. それでもマッチしなければ null（AI 補助は別 PR/将来）

export interface FoodEntry {
  id: string;
  name: string;
  aliases: string[];
}

/** ひらがな (U+3041〜U+3096) を対応するカタカナ (U+30A1〜U+30F6) に変換する */
function hiraToKata(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60),
  );
}

/** 正規化: NFKC, trim, ひら→カナ, lowercase, 内部空白除去
 *
 *  例:
 *    "  ﾄﾘﾓﾓ  "  → "トリモモ"  (NFKC で半角→全角)
 *    "とり もも"  → "トリモモ"  (空白除去 + ひら→カナ)
 *    "Beef ロース" → "BEEFロース" → 比較側も同じ正規化を経る前提
 */
export function normalize(s: string): string {
  if (!s) return "";
  return hiraToKata(s.normalize("NFKC")).trim().replace(/\s+/g, "").toLowerCase();
}

/** foods 一覧から「正規化キー → food.id」のインデックスを構築する。
 *  同じキーが複数ヒットしないよう、最初に登録された ID を優先する。 */
export function buildFoodIndex(foods: FoodEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of foods) {
    addToIndex(map, f.name, f.id);
    for (const alias of f.aliases) {
      addToIndex(map, alias, f.id);
    }
  }
  return map;
}

function addToIndex(map: Map<string, string>, key: string, id: string): void {
  const norm = normalize(key);
  if (!norm) return;
  // 同名の食材が複数ある場合は最初に登録された方を優先する（決定論性）
  if (!map.has(norm)) {
    map.set(norm, id);
  }
}

/** 食材名（raw_name / display_name）から food_id を引く。
 *
 *  優先順:
 *    1. display_name の正規化一致（display_name はユーザーが整えた表記）
 *    2. raw_name の正規化一致（OCR 由来の生の表記）
 *
 *  どちらもヒットしなければ null。 */
export function matchFood(
  rawName: string,
  displayName: string | null | undefined,
  index: Map<string, string>,
): string | null {
  const candidates: string[] = [];
  if (displayName && displayName.trim().length > 0) candidates.push(displayName);
  if (rawName && rawName.trim().length > 0) candidates.push(rawName);

  for (const c of candidates) {
    const norm = normalize(c);
    if (norm && index.has(norm)) {
      return index.get(norm) ?? null;
    }
  }
  return null;
}
