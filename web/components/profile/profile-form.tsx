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
