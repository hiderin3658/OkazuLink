import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { currentMonthStart } from "@/lib/nutrition/queries";
import { AdviceClientWrapper } from "@/components/nutrition/advice-client-wrapper";

export const dynamic = "force-dynamic";

const MONTH_RE = /^(\d{4})-(\d{2})-01$/;

function parseMonthStart(input: string | undefined): string | null {
  if (!input) return null;
  const m = MONTH_RE.exec(input);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return input;
}

export default async function NutritionAdvicePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const monthStart = parseMonthStart(params.month) ?? currentMonthStart();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={{ pathname: "/nutrition", query: { month: monthStart } }}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} aria-hidden />
          栄養レポートへ戻る
        </Link>
        <div className="flex items-start gap-2">
          <Sparkles size={20} aria-hidden className="mt-1 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold">栄養アドバイス</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              月次の栄養データとプロフィールから、AI コーチが目標に沿ったアドバイスと買い足し提案を生成します。
            </p>
          </div>
        </div>
      </header>

      <AdviceClientWrapper monthStart={monthStart} />
    </div>
  );
}
