import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { demoSignOut } from "@/lib/auth/demo-actions";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import type { AuthMode } from "@/lib/auth/session";

export function UserMenu({ mode, name, role }: { mode: AuthMode; name: string; role: Role }) {
  if (mode === "clerk") {
    return (
      <div className="flex flex-col gap-2">
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/dashboard" appearance={{ elements: { rootBox: "w-full" } }} />
        <div className="flex items-center gap-2 text-sm">
          <UserButton />
          <span className="flex-1 truncate">{name}</span>
          <span className="text-xs opacity-70">{ROLE_LABELS[role]}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div>
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs opacity-70">{ROLE_LABELS[role]} · demo</p>
      </div>
      <div className="flex gap-2">
        <Link href="/demo-login" className="flex-1 rounded-md bg-sidebar-accent px-2 py-1.5 text-center text-xs">
          Wissel gebruiker
        </Link>
        <form action={demoSignOut}>
          <button type="submit" className="rounded-md bg-sidebar-accent p-1.5" aria-label="Uitloggen" title="Uitloggen">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
