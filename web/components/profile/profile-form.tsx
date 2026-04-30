"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  updateMyProfile,
  type ProfileActionResult,
} from "@/lib/profile/actions";
import type { UserProfileInput } from "@/lib/profile/schema";
import {
  GOAL_TYPES,
  GOAL_TYPE_LABEL,
  type GoalType,
  type UserProfile,
} from "@/types/database";
import { StringListEditor } from "./string-list-editor";
import { cn } from "@/lib/utils";

interface Props {
  initial: UserProfile | null;
}

export function ProfileForm({ initial }: Props) {
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [goalType, setGoalType] = useState<GoalType | "">(
    initial?.goal_type ?? "",
  );
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [disliked, setDisliked] = useState<string[]>(
    initial?.disliked_foods ?? [],
  );
  // Phase 2 追加: 数値項目は入力しやすいよう文字列で管理し、submit 時に schema が
  // 数値化する。null は "" として表示。
  const [birthYear, setBirthYear] = useState<string>(
    initial?.birth_year != null ? String(initial.birth_year) : "",
  );
  const [heightCm, setHeightCm] = useState<string>(
    initial?.height_cm != null ? String(initial.height_cm) : "",
  );
  const [targetWeight, setTargetWeight] = useState<string>(
    initial?.target_weight_kg != null ? String(initial.target_weight_kg) : "",
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ProfileActionResult | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const input: UserProfileInput = {
      display_name: displayName,
      goal_type: goalType === "" ? "" : goalType,
      allergies,
      disliked_foods: disliked,
      birth_year: birthYear,
      height_cm: heightCm,
      target_weight_kg: targetWeight,
    };
    startTransition(async () => {
      const result = await updateMyProfile(null, input);
      setFeedback(result);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          表示名（任意）
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          placeholder="例: ハナコ"
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          目標タイプ
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setGoalType("")}
            aria-pressed={goalType === ""}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs",
              goalType === ""
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
            )}
          >
            未設定
          </button>
          {GOAL_TYPES.map((g) => {
            const active = goalType === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGoalType(g)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
                )}
              >
                {GOAL_TYPE_LABEL[g]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          アレルギー（レシピ提案で必ず除外されます）
        </label>
        <StringListEditor
          value={allergies}
          onChange={setAllergies}
          placeholder="例: 卵"
          ariaLabel="アレルギーを追加"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          苦手な食材（レシピ提案で極力避けられます）
        </label>
        <StringListEditor
          value={disliked}
          onChange={setDisliked}
          placeholder="例: パクチー"
          ariaLabel="苦手な食材を追加"
        />
      </div>

      {/* Phase 2 追加: 体格情報。栄養レポートの推奨摂取量計算に利用 */}
      <fieldset className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
        <legend className="px-1 text-xs text-[var(--color-muted-foreground)]">
          体格情報（任意・栄養レポートの推奨摂取量に反映）
        </legend>

        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            id="profile-birth-year"
            label="生年（西暦）"
            value={birthYear}
            onChange={setBirthYear}
            min={1900}
            max={new Date().getFullYear()}
            step={1}
            inputMode="numeric"
            placeholder="1990"
            errors={feedback?.ok === false ? feedback.fieldErrors?.birth_year : undefined}
          />
          <NumberField
            id="profile-height"
            label="身長 (cm)"
            value={heightCm}
            onChange={setHeightCm}
            min={50}
            max={250}
            step={0.1}
            inputMode="decimal"
            placeholder="160"
            errors={feedback?.ok === false ? feedback.fieldErrors?.height_cm : undefined}
          />
          <NumberField
            id="profile-target"
            label="目標体重 (kg)"
            value={targetWeight}
            onChange={setTargetWeight}
            min={20}
            max={300}
            step={0.1}
            inputMode="decimal"
            placeholder="55"
            errors={feedback?.ok === false ? feedback.fieldErrors?.target_weight_kg : undefined}
          />
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)]">
          推奨摂取量は厚労省「日本人の食事摂取基準（2020 年版）」女性・身体活動レベル II
          を年齢区分で適用しています。性別は当面「女性」固定です。
        </p>
      </fieldset>

      {feedback?.ok === true && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[color-mix(in_oklch,var(--color-primary)_10%,white)] p-3 text-sm">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>プロフィールを保存しました</span>
        </div>
      )}
      {feedback?.ok === false && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[color-mix(in_oklch,var(--color-destructive)_10%,white)] p-3 text-sm text-[var(--color-destructive)]"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
        >
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {pending ? "保存中..." : "プロフィールを保存"}
        </button>
      </div>
    </form>
  );
}

/** 数値入力 + フィールドエラー表示の共通化（生年・身長・目標体重） */
function NumberField({
  id,
  label,
  value,
  onChange,
  errors,
  ...inputProps
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  errors?: string[];
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "type" | "className">) {
  const hasError = (errors?.length ?? 0) > 0;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs text-[var(--color-muted-foreground)]"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={hasError || undefined}
        className={cn(
          "w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
          hasError
            ? "border-[var(--color-destructive)]"
            : "border-[var(--color-border)]",
        )}
        {...inputProps}
      />
      {hasError && (
        <p className="mt-1 text-xs text-[var(--color-destructive)]">
          {errors?.[0]}
        </p>
      )}
    </div>
  );
}
