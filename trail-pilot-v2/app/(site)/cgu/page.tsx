import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
export const metadata: Metadata = { title: "Conditions d’utilisation", description: "Conditions d’utilisation de Trail Pilot.", alternates: { canonical: "/cgu" } };
export default function Page() {
  return (
    <LegalShell kicker="Document légal" title="Conditions d’utilisation">
      <p>Dernière mise à jour : 4 novembre 2026.</p>
      <h2>Le service</h2>
      <p>Trail Pilot est un outil gratuit d’aide à la planification de l’entraînement en trail, course à pied et randonnée.</p>
      <h2>Pas un avis médical</h2>
      <p>Les décisions proposées (OK, allège, récup) sont des repères généraux calculés à partir de tes saisies. Elles ne constituent ni un diagnostic ni un avis médical. En cas de douleur persistante, de malaise ou de doute, consulte un professionnel de santé. Tu restes seul juge de ta pratique.</p>
      <h2>Tes données</h2>
      <p>Tes données sont stockées sur ton appareil. Pense à les exporter régulièrement : les effacer du navigateur les supprime définitivement.</p>
      <h2>Évolution</h2>
      <p>Le service peut évoluer ou s’interrompre. Toute évolution majeure de ces conditions sera indiquée sur cette page.</p>
    </LegalShell>
  );
}
