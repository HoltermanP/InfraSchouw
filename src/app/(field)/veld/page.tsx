import type { Metadata } from "next";
import { FieldAppClient } from "./client";

export const metadata: Metadata = { title: "Veld-app" };

export default function FieldPage() {
  return <FieldAppClient />;
}
