import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, safeReturnPath } from "@/lib/auth";
import { Logo } from "@/components/Chrome";
import AuthForm from "./auth-form";
import ThemeToggle from "@/components/ThemeToggle";
import { PHOTOS } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connexion", alternates: { canonical: "/connexion" }, robots: { index: false, follow: true } };

export default async function Connexion({ searchParams }: { searchParams: Promise<{ return_to?: string; mode?: string }> }) {
  const sp = await searchParams;
  const returnTo = safeReturnPath(sp.return_to);
  if (await getUser()) redirect(returnTo);
  return (
    <main className="auth">
      <div className="auth-media" aria-hidden="true"><img src={PHOTOS.ridge.src} alt="" /></div>
      <section className="auth-panel">
        <ThemeToggle />
        <Logo />
        <AuthForm returnTo={returnTo} initialMode={sp.mode === "inscription" ? "signup" : "login"} />
        <p className="auth-legal">En créant un compte, tu acceptes les <a href="/cgu">conditions d’utilisation</a> et la <a href="/confidentialite">politique de confidentialité</a>.</p>
      </section>
    </main>
  );
}
