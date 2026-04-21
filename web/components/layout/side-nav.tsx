"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, ChefHat, LineChart, Settings, Shield, Apple, Dumbbell, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード", icon: Home },
  { href: "/shopping", label: "買物", icon: Receipt },
  { href: "/recipes", label: "レシピ", icon: ChefHat },
  { href: "/nutrition", label: "栄養", icon: Apple },
  { href: "/weight", label: "体重", icon: LineChart },
  { href: "/exercise", label: "運動", icon: Dumbbell },
  { href: "/meals", label: "食事", icon: Utensils },
  { href: "/settings", label: "設定", icon: Settings },
] as const;

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-[var(--color-border)] md:block">
      <div className="sticky top-0 p-4">
        <Link href="/dashboard" className="mb-6 block text-lg font-bold">
          OkazuLink
        </Link>
        <nav aria-label="メインナビゲーション">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                        : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
                    )}
                  >
                    <Icon size={18} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {isAdmin && (
              <li className="pt-2">
                <Link
                  href="/admin"
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    pathname.startsWith("/admin")
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                      : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
                  )}
                >
                  <Shield size={18} aria-hidden />
                  管理
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
