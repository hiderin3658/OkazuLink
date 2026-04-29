import { describe, expect, it } from "vitest";
import {
  generateImageFileName,
  ocrToShoppingInput,
  type OcrResult,
} from "./ocr";

const sampleOcr: OcrResult = {
  store_name: "ライフ",
  purchased_at: "2026-04-27",
  total_amount: 1623,
  items: [
    {
      raw_name: "玉ねぎ",
      quantity: 1,
      unit: "袋",
      total_price: 198,
      category: "vegetable",
    },
    {
      raw_name: "豚ロース",
      quantity: 1,
      unit: "パック",
      total_price: 398,
      category: "meat",
    },
  ],
  discounts: [{ label: "クーポン", amount: -60 }],
  confidence: 0.92,
};

describe("ocrToShoppingInput", () => {
  it("基本変換で source_type=receipt、image_paths が反映される", () => {
    const out = ocrToShoppingInput(sampleOcr, ["uid/abc.jpg"]);
    expect(out.source_type).toBe("receipt");
    expect(out.image_paths).toEqual(["uid/abc.jpg"]);
    expect(out.purchased_at).toBe("2026-04-27");
    expect(out.store_name).toBe("ライフ");
    expect(out.total_amount).toBe(1623);
    expect(out.items).toHaveLength(2);
  });

  it("items は OCR 順を保持し、必須フィールドを埋める", () => {
    const out = ocrToShoppingInput(sampleOcr, []);
    expect(out.items[0]!.raw_name).toBe("玉ねぎ");
    expect(out.items[0]!.category).toBe("vegetable");
    expect(out.items[0]!.total_price).toBe(198);
    expect(out.items[0]!.discount).toBe(0);
    expect(out.items[1]!.raw_name).toBe("豚ロース");
  });

  it("不正な category は other に丸める", () => {
    const out = ocrToShoppingInput(
      {
        ...sampleOcr,
        items: [{ ...sampleOcr.items[0]!, category: "imaginary" }],
      },
      [],
    );
    expect(out.items[0]!.category).toBe("other");
  });

  it("店舗名が null の場合は空文字列に置き換え（フォーム入力欄の慣習）", () => {
    const out = ocrToShoppingInput({ ...sampleOcr, store_name: null }, []);
    expect(out.store_name).toBe("");
  });

  it("負の total_price は 0 に丸める", () => {
    const out = ocrToShoppingInput(
      {
        ...sampleOcr,
        items: [{ ...sampleOcr.items[0]!, total_price: -100 }],
      },
      [],
    );
    expect(out.items[0]!.total_price).toBe(0);
  });

  it("小数の total_price は四捨五入", () => {
    const out = ocrToShoppingInput(
      {
        ...sampleOcr,
        items: [{ ...sampleOcr.items[0]!, total_price: 198.6 }],
      },
      [],
    );
    expect(out.items[0]!.total_price).toBe(199);
  });

  it("discounts がある場合は note に転記", () => {
    const out = ocrToShoppingInput(sampleOcr, []);
    expect(out.note).toContain("クーポン");
    expect(out.note).toContain("-60");
  });

  it("discounts が空なら note は空", () => {
    const out = ocrToShoppingInput({ ...sampleOcr, discounts: [] }, []);
    expect(out.note).toBe("");
  });

  it("image_paths は複数渡しを想定", () => {
    const out = ocrToShoppingInput(sampleOcr, ["a.jpg", "b.jpg"]);
    expect(out.image_paths).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("generateImageFileName", () => {
  it("拡張子を正規化して保持", () => {
    expect(generateImageFileName("photo.JPG")).toMatch(/\.jpg$/);
    expect(generateImageFileName("snap.png")).toMatch(/\.png$/);
    expect(generateImageFileName("scan.WEBP")).toMatch(/\.webp$/);
  });

  it("拡張子無しは jpg を fallback", () => {
    expect(generateImageFileName("noext")).toMatch(/\.jpg$/);
  });

  it("怪しい拡張子（記号・長すぎ）は jpg に丸める", () => {
    expect(generateImageFileName("file.../weird")).toMatch(/\.jpg$/);
    expect(generateImageFileName("file.toolongextension")).toMatch(/\.jpg$/);
  });

  it("複数回呼んでも一意（衝突しない）", () => {
    const a = generateImageFileName("a.jpg");
    const b = generateImageFileName("a.jpg");
    expect(a).not.toBe(b);
  });
});
