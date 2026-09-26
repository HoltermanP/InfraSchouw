"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabItem = { href: string; label: string; count?: number | null };

/** Route-based tabs (each tab is its own URL, so it can be linked and refreshed). */
export function TabNav({ items, exactFirst = true }: { items: TabItem[]; exactFirst?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b px-4 md:px-8 print:hidden" aria-label="Tabbladen">
      {items.map((item, i) => {
        const active = i === 0 && exactFirst ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count ? <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{item.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
