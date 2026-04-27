"use client";

// /shopping/new の状態機: レシート OCR → ShoppingForm プリフィル の流れ。
//
// 設計判断:
// - サーバー RSC（page.tsx）はレイアウトとヘッダのみ
// - 本コンポーネントが OCR の有無・結果の状態を保持して切替
// - OCR 成功時は ShoppingForm を key で remount してプリフィル

import { useState } from "react";
import { ReceiptUploader } from "./receipt-uploader";
import { ShoppingForm } from "./shopping-form";
import { ocrToShoppingInput, type OcrResult } from "@/lib/shopping/ocr";
import type { ShoppingRecordInput } from "@/lib/shopping/schema";

export function NewShoppingFlow() {
  const [initial, setInitial] = useState<ShoppingRecordInput | null>(null);
  const [ocrCompleted, setOcrCompleted] = useState(false);

  function handleOcrResult(ocr: OcrResult, imagePath: string) {
    setInitial(ocrToShoppingInput(ocr, [imagePath]));
    setOcrCompleted(true);
  }

  function handleSwitchToManual() {
    setInitial(null);
    setOcrCompleted(false);
  }

  return (
    <div className="space-y-6">
      {!ocrCompleted && <ReceiptUploader onResult={handleOcrResult} />}

      {ocrCompleted && (
        <div className="rounded-lg border border-[color-mix(in_oklch,var(--color-primary)_30%,transparent)] bg-[color-mix(in_oklch,var(--color-primary)_5%,white)] p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>
              ✅ レシートを読み取りました。下の食材リストを確認・修正してください。
            </span>
            <button
              type="button"
              onClick={handleSwitchToManual}
              className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1 text-xs hover:bg-[var(--color-muted)]"
            >
              手入力に切替
            </button>
          </div>
        </div>
      )}

      <ShoppingForm
        // OCR 結果が変わるたびにフォームを再生成して initial を反映
        key={ocrCompleted ? "ocr" : "manual"}
        mode="create"
        initial={initial ?? undefined}
      />
    </div>
  );
}
