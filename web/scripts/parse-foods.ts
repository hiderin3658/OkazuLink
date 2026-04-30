// 食品データ JSON → ParsedFood[] への変換ロジック
//
// 純粋関数として実装することで vitest によるユニットテストを容易にする。

import {
  FOOD_SOURCE_TEXT,
  GROUP_SPECS,
  NAME_VARIANTS,
  NUTRITION_KEY_MAP,
  type FoodCategory,
  type ParsedFood,
  type RawFoodRow,
} from "./foods-mapping";

// =====================================================================
// 内部ヘルパー
// =====================================================================

/** foodId(数値) を 5 桁ゼロ埋めの code 文字列にする */
function formatCode(foodId: number): string {
  return String(foodId).padStart(5, "0");
}

/** groupId から food_group / category を引く（未知の groupId は other 扱い） */
function resolveGroup(groupId: number): { food_group: string; category: FoodCategory } {
  const spec = GROUP_SPECS[groupId];
  if (!spec) {
    return { food_group: `${String(groupId).padStart(2, "0")} 不明`, category: "other" };
  }
  return { food_group: spec.name, category: spec.category };
}

/** "Tr" / "-" / 文字列等の非数値を null に正規化する */
export function normalizeNutritionValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    // "Tr" (痕跡量), "-" (未測定), "(数値)" (推定値) は MVP では null として扱う
    if (trimmed === "" || trimmed === "Tr" || trimmed === "-" || /^\(.*\)$/.test(trimmed)) {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** RawFoodRow から保持対象の栄養素のみ抜き出して jsonb 形式の object を作る */
export function extractNutrition(row: RawFoodRow): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [srcKey, dstKey] of Object.entries(NUTRITION_KEY_MAP)) {
    result[dstKey] = normalizeNutritionValue(row[srcKey]);
  }
  return result;
}

/** 食品名の前後空白・連続空白を整える（中黒や記号は維持） */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// =====================================================================
// 別名（aliases）生成
// =====================================================================

/** 食品成分表の食品名から、先頭の分類前置詞を剥がす。
 *  例: "<畜肉類> ぶた [大型種肉] かた" → "ぶた [大型種肉] かた"
 *
 *  注意: 正規表現は **括弧の真のネスト構造を解析していない**。
 *  単純に「先頭にある () <> [] のいずれかペア」を 1 つ剥がし、それをループで
 *  繰り返す方式。食品成分表 2020 年版（八訂）のデータでは、外側 1 つ + 内側部位
 *  ブラケット 1 つ程度のネスト深度しかないため、現在のループで十分動作する。
 *  もし将来「<a<b>c>」のような真のネストが入った場合は破綻するので、
 *  そのときは括弧マッチングパーサに置き換えること。 */
function stripPrefix(s: string): string {
  let prev: string;
  let cur = s;
  do {
    prev = cur;
    cur = cur.replace(/^\s*[(<\[][^)>\]]+[)>\]]\s*/, "");
  } while (cur !== prev);
  return cur.trim();
}

/** ひらがな (U+3041〜U+3096) を対応するカタカナ (U+30A1〜U+30F6) に変換 */
function hiraToKata(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60),
  );
}

/** 肉類・鳥肉類の複合語別名を生成する。
 *
 *  食品成分表は「<鳥肉類> にわとり [若どり･主品目] もも 皮つき 生」のような
 *  分類フォーマットだが、ユーザーは「鶏もも」「とりもも」のような複合語で入力する。
 *  この差を埋めるため、第二角括弧 [...] の直後の部位名を抽出し
 *  鶏 / とり / 豚 / ぶた / 牛 / うし などと結合した別名を生成する。 */
export function generateMeatAliases(foodName: string): string[] {
  const aliases: string[] = [];

  // パターン: "<鳥肉類>" を含み、にわとり [...] PART で部位を抽出
  if (foodName.includes("<鳥肉類>") && foodName.includes("にわとり")) {
    const m = /にわとり\s*\[[^\]]+\]\s*(\S+)/.exec(foodName);
    if (m && m[1]) {
      const part = m[1];
      aliases.push(`鶏${part}`, `とり${part}`, `若鶏${part}`);
      const kata = hiraToKata(part);
      if (kata !== part) {
        aliases.push(`鶏${kata}`, `とり${kata}`);
      }
    }
  }

  // パターン: "<畜肉類>" + ぶた [...] PART
  if (foodName.includes("<畜肉類>") && foodName.includes("ぶた")) {
    const m = /ぶた\s*\[[^\]]+\]\s*(\S+)/.exec(foodName);
    if (m && m[1]) {
      const part = m[1];
      aliases.push(`豚${part}`, `ぶた${part}`);
      const kata = hiraToKata(part);
      if (kata !== part) {
        aliases.push(`豚${kata}`);
      }
    }
  }

  // パターン: "<畜肉類>" + うし [...] PART
  if (foodName.includes("<畜肉類>") && foodName.includes("うし")) {
    const m = /うし\s*\[[^\]]+\]\s*(\S+)/.exec(foodName);
    if (m && m[1]) {
      const part = m[1];
      aliases.push(`牛${part}`, `うし${part}`);
      const kata = hiraToKata(part);
      if (kata !== part) {
        aliases.push(`牛${kata}`);
      }
    }
  }

  return aliases;
}

/** NAME_VARIANTS 辞書を「単語完全一致」で引く。
 *
 *  foodName を区切り文字（空白・括弧・中点・記号）で分割し、各単語がいずれかの
 *  同義語グループに完全一致すればそのグループの他の表記を別名として返す。
 *  部分文字列ではなく単語マッチにすることで "たまねぎ" → "ねぎ" のような
 *  誤検知を防ぐ。
 *
 *  分割例: "だいず [豆腐･油揚げ類] 木綿豆腐"
 *  → ["だいず", "豆腐", "油揚げ類", "木綿豆腐"]
 *  これにより "豆腐" 単語が抽出され「豆腐」グループにヒットして "とうふ" が追加される。 */
const WORD_SEPARATOR = /[\s\[\]()<>･・、。,]+/;

export function generateDictAliases(foodName: string): string[] {
  const aliases: string[] = [];
  const words = foodName.split(WORD_SEPARATOR).filter((w) => w.length > 0);
  for (const word of words) {
    for (const group of NAME_VARIANTS) {
      if (group.includes(word)) {
        // word 自身も別名に含める（food.name 全体とは別物のため）
        for (const v of group) aliases.push(v);
      }
    }
  }
  return aliases;
}

/** 食品名から DB に保存する aliases 配列を生成する。
 *
 *  生成戦略:
 *    1. 前置詞剥がし後の文字列（"ほうれんそう 葉 通年平均 生"）を 1 つの別名として登録
 *    2. その先頭ワード（"ほうれんそう"）を別名として登録
 *    3. 肉類複合語パターンから鶏もも・豚バラ等を生成
 *    4. COMMON_NAMES 辞書ヒットによる別表記を追加
 *
 *  生成された別名は normalize() を経て foods.aliases にそのまま保存される。
 *  matcher 側の正規化（NFKC + ひら→カナ + 空白除去）と一致するため
 *  追加の前処理は不要。 */
export function generateAliases(foodName: string): string[] {
  const aliases = new Set<string>();

  const stripped = stripPrefix(foodName);
  if (stripped && stripped !== foodName) {
    aliases.add(stripped);
  }

  // 先頭ワード（食品成分表の分類後の主要名）
  const firstWord = stripped.split(/\s+/)[0];
  if (firstWord && firstWord.length > 0) {
    aliases.add(firstWord);
  }

  // 肉類複合語
  for (const a of generateMeatAliases(foodName)) aliases.add(a);

  // 一般名辞書
  for (const a of generateDictAliases(foodName)) aliases.add(a);

  // 食品名そのものは name 列で索引されるので aliases からは除く
  aliases.delete(foodName);

  return Array.from(aliases);
}

// =====================================================================
// メイン関数
// =====================================================================

/**
 * RawFoodRow[] を ParsedFood[] に変換する純粋関数。
 *
 * @param rows katoharu432/standards-tables-of-food-composition-in-japan の data.json
 * @returns DB upsert に使える形に整形した foods 行
 */
export function parseFoodSource(rows: RawFoodRow[]): ParsedFood[] {
  return rows.map((row) => {
    const { food_group, category } = resolveGroup(row.groupId);
    const name = normalizeName(row.foodName);
    return {
      code: formatCode(row.foodId),
      name,
      aliases: generateAliases(name),
      category,
      food_group,
      nutrition_per_100g: extractNutrition(row),
      source: FOOD_SOURCE_TEXT,
    };
  });
}
