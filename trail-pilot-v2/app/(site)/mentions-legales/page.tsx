import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
export const metadata: Metadata = { title: "Mentions légales", description: "Éditeur, hébergeurs et contact de Trail Pilot.", alternates: { canonical: "/mentions-legales" } };
export default function Page() {
  return (
    <LegalShell kicker="Document légal" title="Mentions légales">
      <p>Dernière mise à jour : 7 novembre 2026.</p>
      <h2>Éditeur</h2>
      <p>Trail Pilot est édité par Alexis Couillez, personne physique.<br />Directeur de la publication : Alexis Couillez.<br />Contact : <a href="mailto:alexiscou@outlook.fr?subject=Mentions%20l%C3%A9gales">alexiscou@outlook.fr</a></p>
      <h2>Hébergement</h2>
      <p>Application : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis — <a href="https://vercel.com" rel="noreferrer">vercel.com</a> — <a href="mailto:privacy@vercel.com">privacy@vercel.com</a>.</p>
      <p>Base de données : Turso, 2093 Philadelphia Pike #6336, Claymont, DE 19703, États-Unis — <a href="https://turso.tech" rel="noreferrer">turso.tech</a> — <a href="mailto:support@turso.tech">support@turso.tech</a>.</p>
      <h2>Propriété intellectuelle</h2>
      <p>Les textes, illustrations, éléments graphiques et le code de Trail Pilot appartiennent à l’éditeur, sauf mention contraire. Fonds de carte et recherche de terrains © contributeurs <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> (ODbL) et <a href="https://opentopomap.org" rel="noreferrer">OpenTopoMap</a>. Altitudes : <a href="https://registry.opendata.aws/terrain-tiles/" rel="noreferrer">Mapzen Terrain Tiles</a> (<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" rel="noreferrer">sources</a>) : produit à partir de données Copernicus financées par l’Union européenne (EU-DEM) ; données SRTM et GMTED2010 avec l’aimable autorisation de l’U.S. Geological Survey ; autres sources publiques selon les pays.</p>
      <h2>Données personnelles</h2>
      <p>Voir la <a href="/confidentialite">politique de confidentialité</a>.</p>
    </LegalShell>
  );
}
