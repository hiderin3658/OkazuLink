import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewShoppingFlow } from "@/components/shopping/new-shopping-flow";

export default function NewShoppingPage() {
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
        <h1 className="text-2xl font-bold">買物を登録</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          レシート撮影で自動入力するか、手入力で食材を追加できます
        </p>
      </header>

      <NewShoppingFlow />
    </div>
  );
}
