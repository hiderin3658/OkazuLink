import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getShoppingRecord } from "@/lib/shopping/queries";
import { FOOD_CATEGORY_LABEL, type FoodCategory } from "@/types/database";
import { DeleteShoppingButton } from "./delete-button";

export const dynamic = "force-dynamic";

export default async function ShoppingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getShoppingRecord(id);
  if (!record) {
    notFound();
  }

  const items = record.shopping_items ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/shopping"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} aria-hidden />
          買物一覧へ戻る
        </Link>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">
              {record.store_name ?? "店舗名なし"}
            </h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {formatJapaneseDate(record.purchased_at)} ・ ¥{record.total_amount.toLocaleString()}
              {record.source_type === "receipt" ? " ・ レシート" : " ・ 手入力"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/shopping/${record.id}/edit`}
              className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
            >
              <Pencil size={14} aria-hidden /> 編集
            </Link>
            <DeleteShoppingButton id={record.id} />
          </div>
        </div>
      </header>

      {record.note && (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <span className="text-xs text-[var(--color-muted-foreground)]">メモ</span>
          <p className="mt-1 whitespace-pre-wrap">{record.note}</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">明細（{items.length} 件）</h2>
        <ul className="rounded-lg border border-[var(--color-border)] bg-white">
          {items.map((it, idx) => (
            <li
              key={it.id}
              className={
                "px-4 py-3 text-sm" + (idx > 0 ? " border-t border-[var(--color-border)]" : "")
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{it.display_name ?? it.raw_name}</span>
                <span className="font-semibold tabular-nums">
                  ¥{it.total_price.toLocaleString()}
                  {it.discount > 0 && (
                    <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">
                      (-¥{it.discount.toLocaleString()})
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {FOOD_CATEGORY_LABEL[it.category as FoodCategory] ?? it.category}
                {it.quantity != null && (
                  <>
                    {" ・ "}
                    {it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </>
                )}
                {it.unit_price != null && (
                  <> ・ 単価 ¥{it.unit_price.toLocaleString()}</>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatJapaneseDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}
