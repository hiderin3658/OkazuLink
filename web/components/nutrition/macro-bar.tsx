// PFC（タンパク質・脂質・炭水化物）構成比を 1 本のスタックバーで表示
//
// 1g あたりエネルギー:
//   タンパク質 4 kcal / 脂質 9 kcal / 炭水化物 4 kcal

import type { NutritionSummary } from "@/lib/nutrition/types";

interface Props {
  totals: NutritionSummary["totals"];
}

export function MacroBar({ totals }: Props) {
  const protKcal = (totals.protein_g ?? 0) * 4;
  const fatKcal = (totals.fat_g ?? 0) * 9;
  const carbKcal = (totals.carb_g ?? 0) * 4;
  const sum = protKcal + fatKcal + carbKcal;

  if (sum <= 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted-foreground)]">
        PFC を計算できる食材データがまだありません。
      </div>
    );
  }

  const pP = (protKcal / sum) * 100;
  const pF = (fatKcal / sum) * 100;
  const pC = (carbKcal / sum) * 100;

  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]">
        <div
          className="h-full bg-[#7C3AED]"
          style={{ width: `${pP}%` }}
          aria-label={`タンパク質 ${pP.toFixed(1)}%`}
          title={`タンパク質 ${pP.toFixed(1)}%`}
        />
        <div
          className="h-full bg-[#F59E0B]"
          style={{ width: `${pF}%` }}
          aria-label={`脂質 ${pF.toFixed(1)}%`}
          title={`脂質 ${pF.toFixed(1)}%`}
        />
        <div
          className="h-full bg-[#10B981]"
          style={{ width: `${pC}%` }}
          aria-label={`炭水化物 ${pC.toFixed(1)}%`}
          title={`炭水化物 ${pC.toFixed(1)}%`}
        />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Cell color="#7C3AED" label="タンパク質" pct={pP} grams={totals.protein_g} />
        <Cell color="#F59E0B" label="脂質" pct={pF} grams={totals.fat_g} />
        <Cell color="#10B981" label="炭水化物" pct={pC} grams={totals.carb_g} />
      </dl>
    </div>
  );
}

function Cell({
  color,
  label,
  pct,
  grams,
}: {
  color: string;
  label: string;
  pct: number;
  grams: number;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-2">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      </div>
      <dd className="mt-1">
        <span className="text-base font-semibold tabular-nums">{pct.toFixed(0)}%</span>
        <span className="ml-1 text-xs text-[var(--color-muted-foreground)] tabular-nums">
          / {Math.round(grams).toLocaleString()}g
        </span>
      </dd>
    </div>
  );
}
