// 買物履歴の 1 行表示用カード（Server Component で使う想定）

import Link from "next/link";
import { ChevronRight, Receipt as ReceiptIcon, Pencil } from "lucide-react";
import type { ShoppingRecord } from "@/types/database";

export function ShoppingRecordCard({ record }: { record: ShoppingRecord }) {
  return (
    <Link
      href={`/shopping/${record.id}`}
      className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white p-4 transition-colors hover:bg-[var(--color-muted)]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {record.source_type === "receipt" ? (
            <ReceiptIcon size={14} className="shrink-0 text-[var(--color-muted-foreground)]" aria-hidden />
          ) : (
            <Pencil size={14} className="shrink-0 text-[var(--color-muted-foreground)]" aria-hidden />
          )}
          <span className="truncate text-sm font-medium">
            {record.store_name ?? "店舗名なし"}
          </span>
        </div>
        <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          {formatJapaneseDate(record.purchased_at)}
        </div>
      </div>
      <div className="ml-4 flex items-center gap-2">
        <span className="font-semibold tabular-nums">
          ¥{record.total_amount.toLocaleString()}
        </span>
        <ChevronRight size={16} className="text-[var(--color-muted-foreground)]" aria-hidden />
      </div>
    </Link>
  );
}

function formatJapaneseDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}
