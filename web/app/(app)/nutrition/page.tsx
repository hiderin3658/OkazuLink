import { Flame } from "lucide-react";
import { recomputeMonthlySummary } from "@/lib/nutrition/actions";
import {
  currentMonthStart,
  getMonthlySummaryFromCache,
} from "@/lib/nutrition/queries";
import {
  daysInMonth,
  getMonthlyRecommended,
  pickAgeGroup,
} from "@/lib/nutrition/recommended";
import { getMyProfile } from "@/lib/profile/queries";
import { MonthSelector } from "@/components/nutrition/month-selector";
import { MacroBar } from "@/components/nutrition/macro-bar";
import { NutritionTable } from "@/components/nutrition/nutrition-table";
import { RecomputeButton } from "@/components/nutrition/recompute-button";
import type { NutritionSummary } from "@/lib/nutrition/types";

export const dynamic = "force-dynamic";

const MONTH_RE = /^(\d{4})-(\d{2})-01$/;

/** "YYYY-MM-01" 形式かつ月が 01〜12 の範囲のみ受け入れる。
 *  正規表現単独だと "2026-13-01" 等のあり得ない月を弾けない。 */
function parseMonthStart(input: string | undefined): string | null {
  if (!input) return null;
  const match = MONTH_RE.exec(input);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return input;
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const monthStart = parseMonthStart(params.month) ?? currentMonthStart();

  // 1. キャッシュをまず引く
  const cached = await getMonthlySummaryFromCache(monthStart);

  // 2. キャッシュがなければ初回計算（fresh ならそのまま使う、stale でも一旦表示）
  let summary: NutritionSummary | null = cached?.summary ?? null;
  let computedAt: string | null = cached?.computed_at ?? null;
  let fresh = cached?.fresh ?? false;
  let computeError: string | null = null;

  if (!summary) {
    const result = await recomputeMonthlySummary(monthStart);
    if (result.ok) {
      summary = result.summary;
      computedAt = result.computed_at;
      fresh = true;
    } else {
      computeError = result.message;
    }
  }

  // プロフィールから年齢区分を決定
  const profile = await getMyProfile();
  const ageGroup = pickAgeGroup(profile?.birth_year ?? null);
  const days = daysInMonth(monthStart);
  const recommended = getMonthlyRecommended(ageGroup, days);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">栄養レポート</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            月別の食生活の偏りを把握できます。買物に紐づく食材から自動集計しています。
          </p>
        </div>
        <a
          href={`/nutrition/advice?month=${monthStart}`}
          title="同月の再アクセスは前回結果を再利用するため API コストはかかりません"
          className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)]"
        >
          ✨ AI アドバイス
        </a>
      </header>

      <MonthSelector selected={monthStart} />

      {summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={<Flame size={16} aria-hidden />}
              label="月間エネルギー"
              value={`${Math.round(summary.totals.energy_kcal).toLocaleString()} kcal`}
              sub={`/日換算 ${Math.round(summary.totals.energy_kcal / days).toLocaleString()} kcal`}
            />
            <SummaryCard
              icon={null}
              label="買物回数"
              value={`${summary.record_count} 回`}
              sub={`明細 ${summary.item_count} 件`}
            />
            <SummaryCard
              icon={null}
              label="未マッチ"
              value={`${summary.unmatched_count} 件`}
              sub={
                summary.unmatched_count > 0
                  ? "栄養計算から除外"
                  : "全て紐付け済み"
              }
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">PFC 構成</h2>
            <MacroBar totals={summary.totals} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">
              ビタミン・ミネラル（推奨摂取量比 / {ageGroup} 女性 × {days} 日）
            </h2>
            <NutritionTable totals={summary.totals} recommended={recommended} />
          </section>

          {summary.notes.length > 0 && (
            <section className="rounded-lg border border-[var(--color-border)] bg-white p-3 text-xs text-[var(--color-muted-foreground)] space-y-1">
              <p className="font-semibold">計算前提:</p>
              <ul className="list-disc pl-4">
                {summary.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          <footer className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>
              {computedAt && (
                <>
                  最終計算: {new Date(computedAt).toLocaleString("ja-JP")}
                  {!fresh && "（24時間以上前のキャッシュ）"}
                </>
              )}
            </span>
            <RecomputeButton monthStart={monthStart} />
          </footer>

          <p className="text-xs text-[var(--color-muted-foreground)]">
            出典: 厚生労働省「日本人の食事摂取基準（2020 年版）」女性・身体活動レベル II を基準に算出。
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted-foreground)]">
          {computeError ?? "栄養データがまだありません。買物を登録してから再計算してください。"}
          <div className="mt-3 flex justify-center">
            <RecomputeButton monthStart={monthStart} label="計算する" />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h3 className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
        {icon} {label}
      </h3>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--color-muted-foreground)]">{sub}</p>
    </div>
  );
}
