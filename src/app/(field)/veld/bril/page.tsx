import type { Metadata } from "next";
import { GlassesAppClient } from "../client";

export const metadata: Metadata = { title: "Bril-modus" };

export default function GlassesPage() {
  return <GlassesAppClient />;
}
