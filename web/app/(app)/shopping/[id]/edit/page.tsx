import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getShoppingRecord } from "@/lib/shopping/queries";
import { ShoppingForm } from "@/components/shopping/shopping-form";
import type { ShoppingRecordInput } from "@/lib/shopping/schema";

export const dynamic = "force-dynamic";

export default async function EditShoppingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getShoppingRecord(id);
  if (!record) {
    notFound();
  }

  const initial: ShoppingRecordInput = {
    purchased_at: record.purchased_at,
    store_name: record.store_name ?? "",
    total_amount: record.total_amount,
    note: record.note ?? "",
    source_type: record.source_type,
    image_paths: record.image_paths ?? [],
    items: (record.shopping_items ?? []).map((it) => ({
      raw_name: it.raw_name,
      display_name: it.display_name ?? "",
      category: it.category,
      quantity: it.quantity ?? null,
      unit: it.unit ?? "",
      unit_price: it.unit_price ?? null,
      total_price: it.total_price,
      discount: it.discount,
    })),
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href={`/shopping/${id}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} aria-hidden />
          詳細に戻る
        </Link>
        <h1 className="text-2xl font-bold">買物を編集</h1>
      </header>

      <ShoppingForm mode="edit" recordId={id} initial={initial} />
    </div>
  );
}
