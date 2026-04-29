"use client";

// 食材選択チップ。ユーザーが手持ち食材をタップで複数選択する。
//
// - 親（recipe-suggest-form）が options（候補名）と value/onChange を制御
// - 自由入力欄も併設して、リストに無い食材を追加可能

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  /** デフォルトで何件目までを表示するか（残りは「もっと見る」で展開） */
  initiallyVisible?: number;
}

export function IngredientChipPicker({
  options,
  value,
  onChange,
  initiallyVisible = 12,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customNotice, setCustomNotice] = useState<string | null>(null);

  const visible = showAll ? options : options.slice(0, initiallyVisible);
  const hidden = options.length - visible.length;

  function toggle(name: string) {
    if (value.includes(name)) {
      onChange(value.filter((n) => n !== name));
    } else {
      onChange([...value, name]);
    }
  }

  function removeSelected(name: string) {
    onChange(value.filter((n) => n !== name));
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setCustomNotice(`「${trimmed}」は既に追加されています`);
      setCustomInput("");
      return;
    }
    onChange([...value, trimmed]);
    setCustomInput("");
    setCustomNotice(null);
  }

  // 選択済みのうち options に含まれないもの = カスタム追加分
  const customSelected = value.filter((v) => !options.includes(v));

  return (
    <div className="space-y-3">
      {/* 選択済み一覧 */}
      <div className="flex min-h-[28px] flex-wrap gap-1.5">
        {value.length === 0 ? (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            食材を 1 つ以上選んでください
          </span>
        ) : (
          value.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => removeSelected(v)}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-[var(--color-primary-foreground)]"
              aria-label={`${v} を選択解除`}
            >
              {v}
              <X size={12} aria-hidden />
            </button>
          ))
        )}
      </div>

      {/* 候補チップ */}
      {options.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            最近の購入から選ぶ
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visible.map((name) => {
              const active = value.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  aria-pressed={active}
                  aria-label={
                    active ? `${name} を選択解除` : `${name} を選択`
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
                  )}
                >
                  {name}
                </button>
              );
            })}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="rounded-full border border-dashed border-[var(--color-border)] bg-white px-3 py-1 text-xs text-[var(--color-muted-foreground)]"
              >
                + さらに {hidden} 件
              </button>
            )}
          </div>
        </div>
      )}

      {/* カスタム追加 */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          自由入力で追加
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="例: 卵"
            maxLength={100}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            追加
          </button>
        </div>
        {customSelected.length > 0 && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            自由入力: {customSelected.join(", ")}
          </p>
        )}
        {customNotice && (
          <p
            role="status"
            className="text-xs text-[var(--color-muted-foreground)]"
          >
            {customNotice}
          </p>
        )}
      </div>
    </div>
  );
}
