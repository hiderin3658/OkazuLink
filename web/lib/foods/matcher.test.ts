import { describe, expect, it } from "vitest";
import {
  buildFoodIndex,
  matchFood,
  normalize,
  stripTrailingQuantity,
  type FoodEntry,
} from "./matcher";

const sampleFoods: FoodEntry[] = [
  { id: "f1", name: "豚ロース", aliases: ["豚ロース肉", "ぶたロース"] },
  { id: "f2", name: "鶏もも", aliases: ["とりもも", "とりもも肉", "鶏もも肉"] },
  { id: "f3", name: "玉ねぎ", aliases: ["タマネギ"] },
  { id: "f4", name: "アマランサス 玄穀", aliases: [] },
  { id: "f5", name: "牛乳", aliases: ["ぎゅうにゅう", "ミルク"] },
];

describe("normalize", () => {
  it("空文字・null 同等は空文字を返す", () => {
    expect(normalize("")).toBe("");
  });

  it("前後の空白を除去", () => {
    expect(normalize("  豚ロース  ")).toBe("豚ロース");
  });

  it("内部の空白も除去", () => {
    expect(normalize("豚 ロース")).toBe("豚ロース");
    expect(normalize("豚\tロース\n肉")).toBe("豚ロース肉");
  });

  it("ひらがなはカタカナに変換", () => {
    expect(normalize("とりもも")).toBe("トリモモ");
    expect(normalize("ぎゅうにゅう")).toBe("ギュウニュウ");
  });

  it("半角カナは NFKC で全角カナに正規化", () => {
    expect(normalize("ﾄﾘﾓﾓ")).toBe("トリモモ");
  });

  it("全角英数字は半角に + 小文字化", () => {
    expect(normalize("ＢＥＥＦ")).toBe("beef");
  });

  it("漢字はそのまま", () => {
    expect(normalize("豚ロース")).toBe("豚ロース");
  });

  it("空白を含むカタカナひらがな混在も統合", () => {
    expect(normalize("とり もも 肉")).toBe("トリモモ肉");
  });
});

describe("buildFoodIndex", () => {
  it("name と aliases の両方をキーにする", () => {
    const idx = buildFoodIndex(sampleFoods);
    expect(idx.get(normalize("豚ロース"))).toBe("f1");
    expect(idx.get(normalize("豚ロース肉"))).toBe("f1");
    expect(idx.get(normalize("ぶたロース"))).toBe("f1");
  });

  it("ひら/カナ違いも両方マッチ", () => {
    const idx = buildFoodIndex(sampleFoods);
    // とりもも (ひら) と トリモモ (カナ) は同じ正規化キーになる
    expect(idx.get(normalize("とりもも"))).toBe("f2");
    expect(idx.get(normalize("トリモモ"))).toBe("f2");
  });

  it("空 alias は無視される", () => {
    const idx = buildFoodIndex([
      { id: "x", name: "test", aliases: ["", "  "] },
    ]);
    expect(idx.size).toBe(1);
    expect(idx.get("test")).toBe("x");
  });

  it("同名（正規化後）の食材が複数ある場合、最初の ID を優先", () => {
    const idx = buildFoodIndex([
      { id: "first", name: "test", aliases: [] },
      { id: "second", name: "test", aliases: [] },
    ]);
    expect(idx.get("test")).toBe("first");
  });

  it("空配列でも空 Map を返す", () => {
    const idx = buildFoodIndex([]);
    expect(idx.size).toBe(0);
  });
});

describe("matchFood", () => {
  const idx = buildFoodIndex(sampleFoods);

  it("display_name が完全一致する場合はそちらを優先", () => {
    expect(matchFood("XYZ", "豚ロース", idx)).toBe("f1");
  });

  it("display_name 不在で raw_name が一致する場合", () => {
    expect(matchFood("豚ロース", null, idx)).toBe("f1");
    expect(matchFood("豚ロース", "", idx)).toBe("f1");
  });

  it("alias 経由の一致", () => {
    expect(matchFood("とりもも", null, idx)).toBe("f2");
    expect(matchFood("とりもも肉", null, idx)).toBe("f2");
  });

  it("正規化後の一致（半角カナ・全角混在）", () => {
    expect(matchFood("ﾄﾘﾓﾓ", null, idx)).toBe("f2");
    expect(matchFood("　タマネギ　", null, idx)).toBe("f3");
  });

  it("空白付きでも一致する", () => {
    expect(matchFood("豚 ロース", null, idx)).toBe("f1");
    expect(matchFood("豚 ロース 肉", null, idx)).toBe("f1");
  });

  it("マッチしなければ null", () => {
    expect(matchFood("該当しない食材", null, idx)).toBeNull();
    expect(matchFood("ABC", null, idx)).toBeNull();
  });

  it("空文字や null/undefined は null", () => {
    expect(matchFood("", null, idx)).toBeNull();
    expect(matchFood("", undefined, idx)).toBeNull();
    expect(matchFood("   ", null, idx)).toBeNull();
  });

  it("display_name がマッチしなければ raw_name を試す", () => {
    expect(matchFood("豚ロース", "存在しない名前", idx)).toBe("f1");
  });

  it("複合フレーズ「アマランサス 玄穀」も name 完全一致でヒット", () => {
    expect(matchFood("アマランサス 玄穀", null, idx)).toBe("f4");
    // 空白除去後も一致する
    expect(matchFood("アマランサス玄穀", null, idx)).toBe("f4");
  });

  // === Phase 1+2 統合テスト 5.4 で発見: 数量サフィックス付き OCR 出力対応 ===

  it("末尾の数量+単位を剥がしてマッチ（OCR 5.4 由来）", () => {
    // 「玉ねぎ 2L」「炭酸水 2本」のような OCR 出力
    expect(matchFood("玉ねぎ 2L", null, idx)).toBe("f3");
    // 「3個」のような数量サフィックスも剥がす
    expect(matchFood("玉ねぎ 3個", null, idx)).toBe("f3");
  });

  it("末尾のサイズ表記（2L/3L 等）を剥がしてマッチ", () => {
    expect(matchFood("玉ねぎ2L", null, idx)).toBe("f3");
    expect(matchFood("タマネギ 3L", null, idx)).toBe("f3");
  });

  it("既存マッチが壊れない（剥がしすぎない）", () => {
    // 「アマランサス 玄穀」の末尾「玄穀」を誤剥がししない
    expect(matchFood("アマランサス 玄穀", null, idx)).toBe("f4");
    // 末尾が剥がし対象でなければ素通り
    expect(matchFood("豚ロース", null, idx)).toBe("f1");
  });
});

describe("stripTrailingQuantity", () => {
  it("数字+単位を剥がす", () => {
    expect(stripTrailingQuantity("炭酸水2本")).toBe("炭酸水");
    expect(stripTrailingQuantity("りんご3個")).toBe("りんご");
    expect(stripTrailingQuantity("みかん2袋")).toBe("みかん");
  });

  it("数字+サイズ（l/m/s）を剥がす", () => {
    expect(stripTrailingQuantity("玉ねぎ2l")).toBe("玉ねぎ");
    expect(stripTrailingQuantity("牛乳1l")).toBe("牛乳");
  });

  it("サフィックスがない場合は元のまま", () => {
    expect(stripTrailingQuantity("玉ねぎ")).toBe("玉ねぎ");
    expect(stripTrailingQuantity("豚ロース")).toBe("豚ロース");
  });

  it("空文字や全部剥がれる場合は元を返す（誤剥がし防止）", () => {
    expect(stripTrailingQuantity("")).toBe("");
    expect(stripTrailingQuantity("3個")).toBe("3個"); // 剥がした結果が空 → 元を返す
  });
});
