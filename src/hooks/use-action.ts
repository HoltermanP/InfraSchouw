"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Call a server action, toast the result and refresh the route. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = useCallback(
    <T,>(action: () => Promise<ActionResult<T>>, opts: { success?: string; refresh?: boolean; onSuccess?: (data: T) => void } = {}) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          const res = await action();
          if (res.ok) {
            const msg = opts.success ?? res.message;
            if (msg) toast.success(msg);
            opts.onSuccess?.(res.data);
            if (opts.refresh !== false) router.refresh();
          } else {
            toast.error(res.error);
          }
          resolve(res);
        });
      }),
    [router],
  );
  return { run, pending };
}
