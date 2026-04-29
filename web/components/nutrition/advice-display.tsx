// 取得済みの NutritionAdvice をカード形式で表示する。
//
// - summary_comment: コーチコメントのリード
// - deficiencies: importance に応じて色分けしたカード一覧
// - recommendations: 食材カード一覧

import { AlertTriangle, Sparkles, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AdviceImportance,
  NutritionAdvice,
} from "@/lib/nutrition/advice-types";

interface Props {
  advice: NutritionAdvice;
}

const IMPORTANCE_STYLE: Record<AdviceImportance, string> = {
  high: "border-[var(--color-destructive)] bg-[color-mix(in_oklch,var(--color-destructive)_8%,white)] text-[var(--color-destructive)]",
  medium: "border-[#F59E0B] bg-[color-mix(in_oklch,#F59E0B_8%,white)] text-[#B45309]",
  low: "border-[var(--color-border)] bg-white text-[var(--color-foreground)]",
};

const IMPORTANCE_LABEL: Record<AdviceImportance, string> = {
  high: "重点",
  medium: "注意",
  low: "参考",
};

export function AdviceDisplay({ advice }: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[color-mix(in_oklch,var(--color-primary)_30%,transparent)] bg-[color-mix(in_oklch,var(--color-primary)_5%,white)] p-4">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          <Sparkles size={14} aria-hidden /> コーチコメント
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm">
          {advice.summary_comment}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          <AlertTriangle size={14} aria-hidden /> 注意したい栄養素（{advice.deficiencies.length} 件）
        </h2>
        {advice.deficiencies.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted-foreground)]">
            特に注意すべき栄養素はありませんでした。
          </p>
        ) : (
          <ul className="space-y-2">
            {advice.deficiencies.map((d, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  IMPORTANCE_STYLE[d.importance],
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{d.nutrient}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-white/60 px-2 py-0.5">
                      {IMPORTANCE_LABEL[d.importance]}
                    </span>
                    <span className="tabular-nums">
                      達成率 {Math.round(d.achievement_pct)}%
                    </span>
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[var(--color-foreground)]">
                  {d.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          <Utensils size={14} aria-hidden /> 来月の買い足し提案（{advice.recommendations.length} 件）
        </h2>
        {advice.recommendations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted-foreground)]">
            提案はありません。
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {advice.recommendations.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--color-border)] bg-white p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-sm">{r.food_name}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {r.reason}
                </p>
                {r.nutrients.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.nutrients.map((n) => (
                      <span
                        key={n}
                        className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        このアドバイスは AI（Gemini）が生成したものです。アレルギーや持病等の医学的判断は専門家に相談してください。
      </p>
    </div>
  );
}
