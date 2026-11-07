import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app/AppShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mon espace", robots: { index: false, follow: false } };

export default async function Espace() {
  const user = await requireUser("/espace");
  return <AppShell user={{ name: user.name, email: user.email }} />;
}
