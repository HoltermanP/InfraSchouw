"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  Zap,
  Inbox,
  Settings,
  Smartphone,
  Menu,
  Glasses,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Role } from "@/lib/domain";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; minRole?: Role; badge?: number };

const RANK: Record<Role, number> = { lezer: 0, schouwer: 1, projectleider: 2, admin: 3 };

export function AppNav({ role, inboxCount, orgName, userSlot }: { role: Role; inboxCount: number; orgName: string; userSlot: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const allItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projecten", label: "Projecten", icon: FolderKanban },
    { href: "/schouwen", label: "Schouwen", icon: ClipboardList },
    { href: "/stations", label: "MS-stations", icon: Zap },
    { href: "/inbox", label: "Inbox", icon: Inbox, minRole: "schouwer", badge: inboxCount },
    { href: "/veld", label: "Veld-app", icon: Smartphone, minRole: "schouwer" },
    { href: "/dev/glasses-simulator", label: "Bril-simulator", icon: Glasses, minRole: "admin" },
    { href: "/instellingen", label: "Instellingen", icon: Settings, minRole: "admin" },
  ];
  const items = allItems.filter((i) => !i.minRole || RANK[role] >= RANK[i.minRole]);

  const list = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Hoofdnavigatie">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-sidebar-primary px-2 text-xs font-semibold text-sidebar-primary-foreground">{item.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex flex-col gap-0.5 border-b border-sidebar-border px-5 py-4">
      <Link href="/dashboard" className="text-lg font-bold tracking-tight text-sidebar-foreground">
        Infra<span className="text-sidebar-primary">Schouw</span>
      </Link>
      <span className="truncate text-xs text-sidebar-foreground/70">{orgName}</span>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar lg:flex print:hidden">
        {brand}
        {list}
        <div className="border-t border-sidebar-border p-3">{userSlot}</div>
      </aside>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden print:hidden">
        <Link href="/dashboard" className="font-bold">
          Infra<span className="text-sidebar-primary">Schouw</span>
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="rounded-md p-2" aria-label="Menu openen">
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
            <SheetTitle className="sr-only">Navigatie</SheetTitle>
            {brand}
            {list}
            <div className="border-t border-sidebar-border p-3">{userSlot}</div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
