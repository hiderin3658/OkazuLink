import { describe, expect, it } from "vitest";
import {
  buildFoodIndex,
  matchFood,
  normalize,
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
});
