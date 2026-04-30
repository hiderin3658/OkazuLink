// 模擬レシートの PDF / PNG を Playwright（Chromium）で生成する CLI スクリプト
//
// 使い方:
//   cd web && pnpm gen:receipts                # 全件生成
//   cd web && pnpm gen:receipts 20260312       # slug 前方一致で個別生成
//   cd web && pnpm gen:receipts --format=png   # PNG だけ
//   cd web && pnpm gen:receipts --format=pdf   # PDF だけ
//
// 出力:
//   web/scripts/mock-receipts/output/<slug>.pdf
//   web/scripts/mock-receipts/output/<slug>.png

import { chromium, type Browser } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_RECEIPTS, type MockReceipt } from "./data";
import { buildReceiptHtml } from "./template";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = resolve(__dirname, "output");

type Format = "pdf" | "png" | "both";

interface CliOptions {
  format: Format;
  filterSlug: string | null;
  /** true なら output/ を一旦空にしてから生成 */
  clean: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  let format: Format = "both";
  let filterSlug: string | null = null;
  let clean = false;
  for (const a of args) {
    if (a === "--format=pdf") format = "pdf";
    else if (a === "--format=png") format = "png";
    else if (a === "--format=both") format = "both";
    else if (a === "--clean") clean = true;
    else if (a.startsWith("--")) {
      console.warn(`Unknown option: ${a}`);
    } else {
      filterSlug = a;
    }
  }
  return { format, filterSlug, clean };
}

async function ensureOutputDir(clean: boolean): Promise<void> {
  if (clean) {
    try {
      await rm(OUTPUT_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function renderReceipt(
  browser: Browser,
  receipt: MockReceipt,
  format: Format,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: 320, height: 800 }, // 80mm 幅 ≒ 320px @ 96dpi で近似
  });
  try {
    const html = buildReceiptHtml(receipt);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    if (format === "pdf" || format === "both") {
      const pdfPath = resolve(OUTPUT_DIR, `${receipt.slug}.pdf`);
      // @page サイズと一致させる（80mm × 200mm）
      const buf = await page.pdf({
        path: pdfPath,
        width: "80mm",
        height: "200mm",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      console.log(`  ✓ ${receipt.slug}.pdf (${(buf.length / 1024).toFixed(1)} KB)`);
    }

    if (format === "png" || format === "both") {
      const pngPath = resolve(OUTPUT_DIR, `${receipt.slug}.png`);
      // body の高さに合わせて自動キャプチャ
      const handle = await page.locator("body");
      const buf = await handle.screenshot({ omitBackground: false });
      await writeFile(pngPath, buf);
      console.log(`  ✓ ${receipt.slug}.png (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  await ensureOutputDir(opts.clean);

  const targets = opts.filterSlug
    ? MOCK_RECEIPTS.filter((r) => r.slug.startsWith(opts.filterSlug!))
    : MOCK_RECEIPTS;
  if (targets.length === 0) {
    console.error(`No receipts match "${opts.filterSlug}"`);
    process.exit(1);
  }

  console.log(`Generating ${targets.length} receipt(s) (format=${opts.format})…`);
  const browser = await chromium.launch();
  try {
    for (const r of targets) {
      console.log(`- ${r.slug} ${r.store} ${r.date} (${r.items.length} items)`);
      await renderReceipt(browser, r, opts.format);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n✅ Done. Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
