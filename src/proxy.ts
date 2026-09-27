import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Routes reachable without a session. Everything else requires sign-in.
 * API routes are *not* redirected here: every API handler validates the
 * session/token itself and answers 401 JSON (the offline sync engine relies
 * on that status code).
 */
const PUBLIC_PAGES = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/demo-login(.*)",
  "/configuratie",
  "/offline",
  "/delen/(.*)",
];
const isPublicPage = createRouteMatcher(PUBLIC_PAGES);
const isApi = createRouteMatcher(["/api/(.*)"]);

const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const demoEnabled = process.env.DEMO_MODE === "true";

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (isApi(req) || isPublicPage(req)) return;
  await auth.protect();
});

function demoProxy(req: NextRequest) {
  if (isApi(req) || isPublicPage(req)) return NextResponse.next();
  if (!demoEnabled) return NextResponse.redirect(new URL("/configuratie", req.url));
  if (!req.cookies.get("infraschouw_demo_user")?.value) {
    const url = new URL("/demo-login", req.url);
    url.searchParams.set("terug", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export default clerkEnabled ? clerkProxy : demoProxy;

export const config = {
  matcher: [
    // Skip Next.js internals, the service worker and all static files (incl. demo audio/video,
    // which the service worker precaches: a 404 there aborts its installation).
    "/((?!_next|sw\\.js|swe-worker|manifest\\.webmanifest|[^?]*\\.(?:html?|css|m?js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|mov|wav|mp3|m4a|ogg|md|txt)).*)",
    "/(api|trpc)(.*)",
  ],
};
