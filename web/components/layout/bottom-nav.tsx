"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, ChefHat, LineChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "ホーム", icon: Home },
  { href: "/shopping", label: "買物", icon: Receipt },
  { href: "/recipes", label: "レシピ", icon: ChefHat },
  { href: "/weight", label: "記録", icon: LineChart },
  { href: "/settings", label: "設定", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                  active
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              >
                <Icon size={22} aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
