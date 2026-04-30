// 模擬レシート用データ
//
// /pic/1776690404311.jpg〜46.jpg の手書きノートから書き起こした 2026 年 3 月の
// 買物履歴。Phase 1+2 統合テスト（PR #21 シナリオ 5.4）の OCR 検証で使用する。
//
// 注意: 手書き元データには合計値と明細小計が一致しないケースもあるため、明細は
// 写真を信頼し、合計は写真の合計欄をそのまま採用している（OCR が抽出するのは
// 明細部分なので、合計の整合性は本テストの本質ではない）。

export interface MockReceiptItem {
  /** 商品名（日本語、レシートに印字される表記） */
  name: string;
  /** 単価。原則 1 個あたり */
  unitPrice: number;
  /** 数量（明細上の表現値）。1 が大半 */
  quantity?: number;
  /** 値引き（円）。クーポン等が個別行に当たる場合のみ */
  discount?: number;
  /** 小計（円）。指定なければ unitPrice * quantity - discount で算出する */
  subtotal?: number;
}

export interface MockReceipt {
  /** 出力ファイル名のベース（拡張子なし） */
  slug: string;
  /** 店名 */
  store: string;
  /** YYYY-MM-DD 形式 */
  date: string;
  /** 曜日表記（任意） */
  weekday?: string;
  /** 明細 */
  items: MockReceiptItem[];
  /** 全体クーポン（円、合計から差し引かれる） */
  coupon?: number;
  /** ノート上の合計値（明細から算出した値と異なる場合は写真の値を採用） */
  total: number;
}

export const MOCK_RECEIPTS: MockReceipt[] = [
  // 3/12 (木) マルハチ — 4 明細、単純構成、最初のテストに最適
  {
    slug: "20260312-maruhachi",
    store: "マルハチ",
    date: "2026-03-12",
    weekday: "木",
    items: [
      { name: "キャベツ ハーフ", unitPrice: 88 },
      { name: "豆腐 6P", unitPrice: 98 },
      { name: "納豆", unitPrice: 98 },
      { name: "本みりん", unitPrice: 248 },
    ],
    total: 629,
  },

  // 3/14 (土) マルハチ — 6 明細、よくある野菜中心
  {
    slug: "20260314-maruhachi",
    store: "マルハチ",
    date: "2026-03-14",
    weekday: "土",
    items: [
      { name: "ミニトマト", unitPrice: 187 },
      { name: "ブロッコリー", unitPrice: 100 },
      { name: "エリンギ", unitPrice: 98 },
      { name: "カボチャ", unitPrice: 136 },
      { name: "豆乳コーヒー", unitPrice: 78 },
      { name: "えびのお頭", unitPrice: 118 },
    ],
    total: 774,
  },

  // 3/14 (土) ライフ — 15 明細、野菜・肉・乳製品の混在パターン
  {
    slug: "20260314-life",
    store: "ライフ",
    date: "2026-03-14",
    weekday: "土",
    items: [
      { name: "玉ねぎ 2L", unitPrice: 98 },
      { name: "にんじん", unitPrice: 49 },
      { name: "ほうれん草", unitPrice: 100 },
      { name: "さやえんどう", unitPrice: 147 },
      { name: "アボカド", unitPrice: 297 },
      { name: "炭酸水 2本", unitPrice: 118 },
      { name: "鶏もも", unitPrice: 60 },
      { name: "豚ばら肉", unitPrice: 138 },
      { name: "えのき", unitPrice: 79 },
      { name: "しめじ", unitPrice: 99 },
      { name: "豆腐", unitPrice: 99 },
      { name: "キムチ", unitPrice: 199 },
      { name: "スライスチーズ", unitPrice: 248 },
      { name: "さつまいも", unitPrice: 49 },
      { name: "明太子", unitPrice: 457 },
    ],
    total: 3090,
  },

  // 3/7 (土) ライフ — 6 明細 + クーポン
  {
    slug: "20260307-life",
    store: "ライフ",
    date: "2026-03-07",
    weekday: "土",
    items: [
      { name: "サラダ油", unitPrice: 199 },
      { name: "焼きおむすび", unitPrice: 59 },
      { name: "牛肉切り身", unitPrice: 139 },
      { name: "ドレッシング", unitPrice: 199 },
      { name: "バター", unitPrice: 349 },
      { name: "ティッシュ 5P", unitPrice: 258 },
    ],
    coupon: 10,
    total: 1196,
  },

  // 3/9 (月) ダイクマ — 3 明細
  {
    slug: "20260309-daikuma",
    store: "ダイクマ",
    date: "2026-03-09",
    weekday: "月",
    items: [
      { name: "大根せんべい 2袋", unitPrice: 296 },
      { name: "カロリーメイト 10本", unitPrice: 198 },
      { name: "グラノーラ", unitPrice: 398 },
    ],
    total: 923,
  },

  // 3/15 (日) ライフ — 7 明細 + クーポン
  {
    slug: "20260315-life",
    store: "ライフ",
    date: "2026-03-15",
    weekday: "日",
    items: [
      { name: "焼酎ハイボール", unitPrice: 118 },
      { name: "アイコみかん", unitPrice: 149 },
      { name: "牛肉切り身", unitPrice: 399 },
      { name: "牛乳 900cc", unitPrice: 258 },
      { name: "しらたき", unitPrice: 138 },
      { name: "いちごあんぱん", unitPrice: 398 },
      { name: "食パン 3枚", unitPrice: 159 },
    ],
    coupon: 60,
    total: 1623,
  },

  // 3/18 (木) ライフ — 14 明細、購入量が多い日
  {
    slug: "20260318-life",
    store: "ライフ",
    date: "2026-03-18",
    weekday: "木",
    items: [
      { name: "パンケーキ粉", unitPrice: 328 },
      { name: "チューハイ", unitPrice: 110 },
      { name: "アイス モナ王", unitPrice: 139 },
      { name: "豚こま", unitPrice: 185 },
      { name: "おろししょうが", unitPrice: 98 },
      { name: "大葉", unitPrice: 393 },
      { name: "にら", unitPrice: 298 },
      { name: "玉子 6P", unitPrice: 189 },
      { name: "サニーレタス", unitPrice: 99 },
      { name: "オクラ", unitPrice: 99 },
      { name: "ミニ玉ねぎ 3P", unitPrice: 118 },
      { name: "ミニトマト", unitPrice: 198 },
      { name: "ナス 2本", unitPrice: 118 },
      { name: "しめじ", unitPrice: 99 },
    ],
    total: 3258,
    coupon: 130,
  },

  // 3/22 (日) ライフ — 13 明細
  {
    slug: "20260322-life",
    store: "ライフ",
    date: "2026-03-22",
    weekday: "日",
    items: [
      { name: "食パン 3枚", unitPrice: 111 },
      { name: "焼きおむすび 2本", unitPrice: 118 },
      { name: "ロースターストック", unitPrice: 199 },
      { name: "チューハイ", unitPrice: 110 },
      { name: "豆乳味おはぎ", unitPrice: 139 },
      { name: "ギョーザ 2袋", unitPrice: 398 },
      { name: "とり胸肉", unitPrice: 388 },
      { name: "アイス クラシモナ", unitPrice: 139 },
      { name: "ポテトチップス", unitPrice: 199 },
      { name: "パン ハーフ", unitPrice: 199 },
      { name: "大根 ハーフ", unitPrice: 53 },
      { name: "きゅうり 2本", unitPrice: 78 },
    ],
    total: 2720,
  },

  // 3/27 (金) マルハチ — 6 明細
  {
    slug: "20260327-maruhachi",
    store: "マルハチ",
    date: "2026-03-27",
    weekday: "金",
    items: [
      { name: "もりおか冷麺", unitPrice: 348 },
      { name: "納豆", unitPrice: 98 },
      { name: "おかずキャベツ", unitPrice: 196, quantity: 2 },
      { name: "せんべい", unitPrice: 148 },
      { name: "ヒラメ", unitPrice: 198 },
      { name: "ソンノラ風煮物", unitPrice: 108 },
    ],
    total: 1291,
  },

  // 3/29 (日) ライフ — 8 明細 + クーポン
  {
    slug: "20260329-life",
    store: "ライフ",
    date: "2026-03-29",
    weekday: "日",
    items: [
      { name: "ドラ焼きやきもき", unitPrice: 386 },
      { name: "牛乳 1ロウル", unitPrice: 199 },
      { name: "豆腐 6P", unitPrice: 69 },
      { name: "にんじん", unitPrice: 89 },
      { name: "アイス クラシモール", unitPrice: 139 },
      { name: "ペンネパスタ", unitPrice: 298 },
      { name: "炭酸水 2本", unitPrice: 118 },
      { name: "揉ましビケラ", unitPrice: 287 },
    ],
    coupon: 20,
    total: 1520,
  },
];
