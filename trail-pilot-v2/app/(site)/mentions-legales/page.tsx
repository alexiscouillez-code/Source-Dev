import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
export const metadata: Metadata = { title: "Mentions légales", description: "Éditeur, hébergeur et contact de Trail Pilot.", alternates: { canonical: "/mentions-legales" } };
export default function Page() {
  return (
    <LegalShell kicker="Document légal" title="Mentions légales">
      <p>Dernière mise à jour : 4 novembre 2026.</p>
      <h2>Éditeur</h2>
      <p>Trail Pilot est édité par Alexis Couillez, personne physique, dans le cadre d’un projet indépendant et non commercial.<br />Contact : <a href="mailto:alexiscou@outlook.fr?subject=Mentions%20l%C3%A9gales">alexiscou@outlook.fr</a></p>
      <h2>Hébergement</h2>
      <p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — <a href="https://vercel.com" rel="noreferrer">vercel.com</a>.</p>
      <h2>Propriété intellectuelle</h2>
      <p>Les textes, illustrations et éléments graphiques de Trail Pilot appartiennent à l’éditeur, sauf mention contraire.</p>
    </LegalShell>
  );
}
