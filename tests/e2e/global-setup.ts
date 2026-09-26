import { execSync } from "node:child_process";

/** Fresh, deterministic demo data before every e2e run. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return;
  execSync("pnpm db:seed", { stdio: "inherit" });
}
