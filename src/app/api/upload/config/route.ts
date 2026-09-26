import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { orgPrefix, storageMode } from "@/lib/storage";

export const GET = withSession(async (_req, session) =>
  NextResponse.json({ mode: storageMode(), prefix: orgPrefix(session.org.id) }),
);
