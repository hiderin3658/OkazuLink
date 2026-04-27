"use client";

// レシート画像のアップロード + extract-receipt 呼び出しを担当する
// クライアントコンポーネント。
//
// フロー:
//   1. ユーザーが画像を選択（モバイルでは camera capture も可）
//   2. プレビュー表示
//   3. 「食材を抽出」ボタンクリック
//   4. Supabase Storage `receipts/<userId>/<uuid>.<ext>` へアップロード
//   5. Edge Function `extract-receipt` を invoke
//   6. 成功時 onResult(ocr, imagePath) で親に通知
//   7. 失敗時はエラー表示 + リトライ可能

import { useRef, useState } from "react";
import { Camera, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  generateImageFileName,
  type OcrResult,
} from "@/lib/shopping/ocr";

type Status = "idle" | "uploading" | "extracting" | "error";

interface Props {
  /** OCR 成功時。imagePath は Storage 内の "<userId>/<uuid>.<ext>" 形式 */
  onResult: (ocr: OcrResult, imagePath: string) => void;
}

export function ReceiptUploader({ onResult }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErrorMessage("画像ファイルを選択してください");
      return;
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setErrorMessage(null);
    setStatus("idle");
  }

  function handleReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleExtract() {
    if (!file) return;
    setErrorMessage(null);

    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      setErrorMessage("認証エラー: ログインし直してください");
      setStatus("error");
      return;
    }

    // 1. Storage アップロード
    setStatus("uploading");
    const fileName = generateImageFileName(file.name);
    const path = `${user.id}/${fileName}`;
    const { error: uploadErr } = await supabase.storage
      .from("receipts")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (uploadErr) {
      setErrorMessage(`アップロード失敗: ${uploadErr.message}`);
      setStatus("error");
      return;
    }

    // 2. extract-receipt invoke
    setStatus("extracting");
    const { data, error: fnErr } = await supabase.functions.invoke<OcrResult>(
      "extract-receipt",
      { body: { imagePath: path } },
    );
    if (fnErr || !data) {
      setErrorMessage(toErrorMessage(fnErr));
      setStatus("error");
      return;
    }

    // 3. 親に結果を渡す
    onResult(data, path);
    setStatus("idle");
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">レシート画像から自動入力</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            撮影またはファイル選択 → AI で食材リスト・店舗・合計を抽出します
          </p>
        </div>
      </div>

      {!file ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)] p-6 text-sm hover:bg-[color-mix(in_oklch,var(--color-muted)_50%,white)]">
          <Camera size={28} aria-hidden />
          <span>画像を選択 / 撮影</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleSelectFile}
          />
        </label>
      ) : (
        <div className="space-y-3">
          {previewUrl && (
            // next/image は blob: URL を扱えないため、プレビューには素の <img> を使う。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="選択された画像のプレビュー"
              className="max-h-64 w-full rounded-md border border-[var(--color-border)] object-contain"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={status === "uploading" || status === "extracting"}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {(status === "uploading" || status === "extracting") && (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              )}
              {status === "uploading"
                ? "アップロード中..."
                : status === "extracting"
                  ? "食材を抽出中..."
                  : "食材を抽出"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={status === "uploading" || status === "extracting"}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden />
              選び直す
            </button>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {(file.size / 1024).toFixed(0)} KB / {file.type || "image/*"}
            </span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[color-mix(in_oklch,var(--color-destructive)_10%,white)] p-3 text-sm text-[var(--color-destructive)]"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{errorMessage}</span>
        </div>
      )}

      <p className="text-xs text-[var(--color-muted-foreground)]">
        ※ 抽出結果は下のフォームに反映されます。送信前に確認・修正してください。
      </p>
    </section>
  );
}

/** Edge Function のエラーをユーザー向けの日本語メッセージに変換 */
function toErrorMessage(err: unknown): string {
  if (!err) return "OCR に失敗しました（不明なエラー）";
  // supabase.functions.invoke の error は FunctionsError で .message を持つ。
  // また Edge Function 側のエラー JSON を context に持っている場合もある。
  const e = err as { message?: string; context?: { code?: string; error?: string } };
  const code = e.context?.code;
  switch (code) {
    case "AUTH_NOT_ALLOWED":
      return "このアカウントは利用許可されていません。";
    case "BUDGET_EXCEEDED":
      return "今月の AI 利用上限に達しました。管理者に連絡してください。";
    case "AI_TIMEOUT":
      return "AI の応答がタイムアウトしました。少し時間をおいて再度お試しください。";
    case "AI_BLOCKED":
      return "画像内容が AI 安全フィルタに引っかかりました。別の画像でお試しください。";
    case "AI_INVALID_RESPONSE":
      return "レシートを認識できませんでした。手入力で登録するか、画像をきれいに撮り直してください。";
    case "BAD_REQUEST":
      return e.context?.error ?? "リクエストエラー";
    default:
      return e.message ?? "OCR に失敗しました";
  }
}
