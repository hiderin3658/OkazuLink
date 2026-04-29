"use client";

// 文字列の集合をタグ風に編集する汎用コンポーネント。
// allergies / disliked_foods 等で使う。

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLen?: number;
  maxCount?: number;
}

export function StringListEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLen = 30,
  maxCount = 30,
}: Props) {
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function add() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed.length > maxLen) {
      setNotice(`${maxLen} 文字以内で入力してください`);
      return;
    }
    if (value.includes(trimmed)) {
      setNotice(`「${trimmed}」は既に追加されています`);
      setInput("");
      return;
    }
    if (value.length >= maxCount) {
      setNotice(`最大 ${maxCount} 件まで登録できます`);
      return;
    }
    onChange([...value, trimmed]);
    setInput("");
    setNotice(null);
  }

  function remove(name: string) {
    onChange(value.filter((n) => n !== name));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 ? (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            まだ登録されていません
          </span>
        ) : (
          value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-3 py-1 text-xs"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`${v} を削除`}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-label={ariaLabel}
          placeholder={placeholder}
          maxLength={maxLen}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
        >
          追加
        </button>
      </div>
      {notice && (
        <p role="status" className="text-xs text-[var(--color-muted-foreground)]">
          {notice}
        </p>
      )}
    </div>
  );
}
