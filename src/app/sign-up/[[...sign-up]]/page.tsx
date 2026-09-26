import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { authMode } from "@/lib/auth/session";

export default function SignUpPage() {
  if (authMode() !== "clerk") redirect("/demo-login");
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
