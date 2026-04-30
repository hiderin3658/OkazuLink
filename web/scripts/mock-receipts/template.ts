// 模擬レシート HTML テンプレート
//
// 日本のスーパー風レシートレイアウトを生成する。等幅フォントを基調に、
// レシート用紙幅 80mm を想定した縦長レイアウト。OCR の入力として
// 使うので、実際のレシートに近い視覚特性を再現することを優先する。

import type { MockReceipt, MockReceiptItem } from "./data";

/** HTML エスケープ（XSS を意識した最低限のもの。本テンプレは外部公開しない前提だが
 *  念のため）*/
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function calcSubtotal(item: MockReceiptItem): number {
  if (typeof item.subtotal === "number") return item.subtotal;
  const qty = item.quantity ?? 1;
  const disc = item.discount ?? 0;
  return item.unitPrice * qty - disc;
}

function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function formatDate(date: string, weekday?: string): string {
  // YYYY-MM-DD → 2026年3月12日(木)
  const [y, m, d] = date.split("-").map(Number);
  const wd = weekday ? `(${weekday})` : "";
  return `${y}年${m}月${d}日${wd}`;
}

function buildItemsHtml(items: MockReceiptItem[]): string {
  const rows: string[] = [];
  for (const it of items) {
    const qty = it.quantity ?? 1;
    const subtotal = calcSubtotal(it);
    if (qty === 1) {
      rows.push(
        `<div class="row">
          <span class="name">${esc(it.name)}</span>
          <span class="amount">${formatYen(subtotal)}</span>
        </div>`,
      );
    } else {
      // 2 行表示: 商品名 + 単価×数量
      rows.push(
        `<div class="row">
          <span class="name">${esc(it.name)}</span>
          <span class="amount">${formatYen(subtotal)}</span>
        </div>
        <div class="row sub">
          <span class="name">  ${formatYen(it.unitPrice)} × ${qty}</span>
        </div>`,
      );
    }
    if (it.discount && it.discount > 0) {
      rows.push(
        `<div class="row sub">
          <span class="name">  値引</span>
          <span class="amount">-${formatYen(it.discount)}</span>
        </div>`,
      );
    }
  }
  return rows.join("\n");
}

/** 1 件のレシート分の完結した HTML 文書を返す。
 *  Playwright で `setContent` → `pdf()` / `screenshot()` する。 */
export function buildReceiptHtml(r: MockReceipt): string {
  const itemsTotal = r.items.reduce((acc, it) => acc + calcSubtotal(it), 0);
  const couponLine =
    typeof r.coupon === "number" && r.coupon > 0
      ? `<div class="row sub">
          <span class="name">クーポン値引</span>
          <span class="amount">-${formatYen(r.coupon)}</span>
        </div>`
      : "";
  // 表示用の店舗住所・電話・レジ番号はテスト用なのでダミー
  const phone = (() => {
    // store 文字数から簡易擬似電話番号（毎回同じになる決定論性確保）
    let h = 0;
    for (const c of r.store) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    const n = String(Math.abs(h) % 9000 + 1000);
    return `03-${n.slice(0, 4)}-${("0000" + (Math.abs(h) % 10000)).slice(-4)}`;
  })();
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${esc(r.store)} レシート ${r.date}</title>
<style>
  /* レシートサーマル紙風: 80mm 幅、等幅で OCR 向け */
  @page {
    size: 80mm 200mm;
    margin: 0;
  }
  body {
    font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP",
      "Noto Sans JP", monospace;
    font-size: 11pt;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 8mm 4mm;
    width: 72mm;
    box-sizing: border-box;
    line-height: 1.45;
  }
  .header { text-align: center; font-weight: bold; margin-bottom: 1mm; }
  .header .store { font-size: 16pt; letter-spacing: 0.05em; }
  .header .meta { font-weight: normal; font-size: 9pt; color: #333; }
  .date { text-align: center; font-size: 10pt; margin: 1mm 0 2mm; }
  hr {
    border: none;
    border-top: 1px dashed #555;
    margin: 2mm 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 11pt;
  }
  .row .name { white-space: pre-wrap; word-break: break-all; }
  .row.sub { font-size: 9pt; color: #444; }
  .row .amount { font-variant-numeric: tabular-nums; }
  .total { font-size: 13pt; font-weight: bold; margin-top: 1mm; }
  .footer {
    text-align: center;
    font-size: 9pt;
    color: #555;
    margin-top: 4mm;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="store">${esc(r.store)}</div>
    <div class="meta">テスト用模擬レシート</div>
    <div class="meta">TEL ${phone}</div>
  </div>
  <div class="date">${esc(formatDate(r.date, r.weekday))}</div>
  <hr />
  <div class="items">
    ${buildItemsHtml(r.items)}
  </div>
  <hr />
  <div class="row">
    <span class="name">小計</span>
    <span class="amount">${formatYen(itemsTotal)}</span>
  </div>
  ${couponLine}
  <div class="row total">
    <span class="name">合計</span>
    <span class="amount">${formatYen(r.total)}</span>
  </div>
  <div class="footer">
    OkazuLink mock receipt — for OCR test only
  </div>
</body>
</html>`;
}
