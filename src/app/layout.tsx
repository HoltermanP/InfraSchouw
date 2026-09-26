import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { nlNL } from "@clerk/localizations";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "InfraSchouw", template: "%s · InfraSchouw" },
  description: "Schouwen vastleggen in het veld en AI-ondersteunde schouwverslagen voor ondergrondse infra.",
  applicationName: "InfraSchouw",
  appleWebApp: { capable: true, title: "InfraSchouw", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f4c81",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({ children }: LayoutProps<"/">) {
  const content = (
    <TooltipProvider>
      {children}
      <Toaster richColors position="top-center" />
      <ServiceWorkerRegister />
    </TooltipProvider>
  );
  return (
    <html lang="nl" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {clerkEnabled ? <ClerkProvider localization={nlNL}>{content}</ClerkProvider> : content}
      </body>
    </html>
  );
}
