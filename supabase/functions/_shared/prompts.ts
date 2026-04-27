// Gemini プロンプトテンプレート
//
// 設計書 §9.3 の方針:
// - 日本語で入出力
// - 出力は JSON Schema で固定
// - システムプロンプトに「一人暮らし女性の食生活コーチ」のペルソナ
//
// 純粋関数のみを公開する（テンプレ文字列の組立のみ）。

const SYSTEM_PERSONA = `あなたは「一人暮らし女性向けの食生活コーチ」です。
日本語で簡潔に返答し、相手のライフスタイルに寄り添った提案をします。
出力は必ず JSON Schema で指定された形式で返してください。`;

// =====================================================================
// extract-receipt: レシート OCR プロンプト
// =====================================================================

export interface BuildReceiptOcrPromptInput {
  /** 画像が解析対象であることを補助する追加情報（任意） */
  hint?: string;
}

export function buildReceiptOcrPrompt(input: BuildReceiptOcrPromptInput = {}): {
  system: string;
  user: string;
} {
  return {
    system: SYSTEM_PERSONA,
    user: `添付のレシート画像から、以下の情報を抽出してください。

- 店舗名 (store_name)
- 購入日 (purchased_at, "YYYY-MM-DD")
- 合計金額 (total_amount, 円, 整数)
- 商品リスト (items): 各商品について
  - raw_name: 表記そのまま
  - quantity: 数量（不明なら null）
  - unit: 単位 ("個", "g", "ml", "パック" 等。不明なら null）
  - total_price: 値段（円、整数）
  - category: "vegetable" / "meat" / "fish" / "dairy" / "grain" / "seasoning" / "beverage" / "sweet" / "fruit" / "egg" / "other" のいずれか
- 値引き (discounts): クーポン値引き等。各要素 { label, amount(負の整数) }
- 信頼度 (confidence): 0.0 〜 1.0

抽出できなかった項目は null とし、可読性が悪い場合は confidence を低く設定してください。
${input.hint ? `\n補足: ${input.hint}` : ""}

JSON のみを返してください。前置きや説明文は不要です。`,
  };
}

// =====================================================================
// suggest-recipes: ジャンル別レシピ提案プロンプト
// =====================================================================

export interface BuildRecipeSuggestPromptInput {
  ingredients: string[];
  cuisine: string; // "japanese" | "chinese" | "italian" | ...
  servings?: number;
  allergies?: string[];
  dislikedFoods?: string[];
  goalType?: string | null;
  candidateCount?: number;
}

export function buildRecipeSuggestPrompt(input: BuildRecipeSuggestPromptInput): {
  system: string;
  user: string;
} {
  const {
    ingredients,
    cuisine,
    servings = 1,
    allergies = [],
    dislikedFoods = [],
    goalType = null,
    candidateCount = 4,
  } = input;

  const lines: string[] = [];
  lines.push(`手持ち食材: ${ingredients.join(", ")}`);
  lines.push(`料理ジャンル: ${cuisine}`);
  lines.push(`人数: ${servings}`);
  if (allergies.length > 0) lines.push(`アレルギー（必ず除外）: ${allergies.join(", ")}`);
  if (dislikedFoods.length > 0) lines.push(`苦手な食材（極力避ける）: ${dislikedFoods.join(", ")}`);
  if (goalType) lines.push(`目標: ${goalType}`);
  lines.push(`候補数: ${candidateCount} 件`);

  return {
    system: SYSTEM_PERSONA,
    user: `以下の条件で家庭料理レシピを ${candidateCount} 件提案してください。

${lines.join("\n")}

各レシピは以下の構造の JSON 配列で返してください:
[
  {
    "title": string,
    "cuisine": string,
    "description": string,
    "servings": number,
    "time_minutes": number,
    "calories_kcal": number | null,
    "ingredients": [{ "name": string, "amount": string, "optional": boolean }],
    "steps": [string, ...]
  },
  ...
]

注意:
- 手順 (steps) は番号なしの平文で 5 ステップ前後にまとめる
- 手持ちにない食材は ingredients に含める時 optional=true にする
- アレルギーは絶対に含めない

JSON のみを返してください。前置きや説明文は不要です。`,
  };
}

/** プロンプトのハッシュ用文字列（recipes.generated_prompt_hash の元データ）
 *  ingredients は順序非依存にしたいのでソート、dislikedFoods/allergies も同様 */
export function buildRecipeCacheKey(input: BuildRecipeSuggestPromptInput): string {
  const norm = {
    ingredients: [...input.ingredients].map((s) => s.trim()).sort().join("|"),
    cuisine: input.cuisine,
    servings: input.servings ?? 1,
    allergies: [...(input.allergies ?? [])].sort().join("|"),
    disliked: [...(input.dislikedFoods ?? [])].sort().join("|"),
    goal: input.goalType ?? "",
    n: input.candidateCount ?? 4,
  };
  return JSON.stringify(norm);
}
