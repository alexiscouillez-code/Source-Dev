import type { Metadata } from "next";
import { Logo } from "@/components/Chrome";
import ThemeToggle from "@/components/ThemeToggle";
import { PHOTOS } from "@/lib/photos";
import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false, follow: false } };

export default async function Reinitialiser({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="auth">
      <div className="auth-media" aria-hidden="true"><img src={PHOTOS.ridge.src} alt="" /></div>
      <section className="auth-panel">
        <ThemeToggle />
        <Logo />
        <ResetForm token={token ?? ""} />
      </section>
    </main>
  );
}
