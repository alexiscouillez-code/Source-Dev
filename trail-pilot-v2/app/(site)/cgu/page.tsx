import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
export const metadata: Metadata = { title: "Conditions d’utilisation", description: "Conditions d’utilisation de Trail Pilot.", alternates: { canonical: "/cgu" } };
const MAIL = "alexiscou@outlook.fr";
export default function Page() {
  return (
    <LegalShell kicker="Document légal" title="Conditions d’utilisation">
      <p>Dernière mise à jour : 7 novembre 2026.</p>
      <h2>Objet</h2>
      <p>Ces conditions encadrent l’utilisation de Trail Pilot, un service en ligne d’aide à la planification de l’entraînement en trail, course à pied et randonnée, édité par Alexis Couillez (voir les <a href="/mentions-legales">mentions légales</a>). En créant un compte, tu les acceptes.</p>
      <h2>Accès au service</h2>
      <p>Trail Pilot est réservé aux personnes majeures (18 ans et plus). Un compte est personnel : une seule personne par compte, avec une adresse e-mail valide et des informations exactes. Tu es responsable de la confidentialité de ton mot de passe et de ce qui est fait depuis ton compte ; préviens-nous sans attendre en cas d’usage frauduleux.</p>
      <h2>Prix</h2>
      <p>Le service est actuellement gratuit. Si des offres payantes sont proposées un jour, leur contenu, leur prix et leurs conditions (dont le droit de rétractation) te seront présentés avant tout paiement, et rien ne te sera facturé sans ton accord.</p>
      <h2>Pas un avis médical</h2>
      <p>Les décisions proposées (OK, allège, récup), le plan, les allures, la VO2max estimée, l’X-Ray et les réponses du coach sont des repères généraux calculés à partir de tes saisies. Ils ne constituent ni un diagnostic, ni un avis médical, ni un suivi par un entraîneur diplômé. Avant de reprendre ou d’intensifier le sport, un avis médical est recommandé. En cas de douleur persistante, de malaise ou de doute, arrête-toi et consulte un professionnel de santé.</p>
      <h2>Pratique en montagne</h2>
      <p>Le trail et la randonnée comportent des risques propres (terrain, altitude, météo, isolement). Tu restes seul juge de ta pratique : vérifie les conditions, adapte ton itinéraire et ton matériel, et ne te fie pas uniquement à l’appli, à sa météo ou à ses cartes, qui peuvent être incomplètes ou en retard. Les terrains proposés sont calculés automatiquement à partir des données ouvertes d’OpenStreetMap : ils n’ont pas été reconnus sur place, peuvent traverser des propriétés privées, des chemins fermés ou dangereux, et leur dénivelé est estimé. Vérifie l’accès et l’itinéraire avant de partir.</p>
      <h2>Coach IA</h2>
      <p>Le coach répond automatiquement grâce à un modèle d’intelligence artificielle. Ses réponses peuvent être inexactes ou incomplètes : vérifie ce qui compte. Le nombre de questions est limité par jour pour garder le service disponible pour tous.</p>
      <h2>Services tiers</h2>
      <p>Certaines fonctions s’appuient sur des services extérieurs : Strava pour l’import des sorties, Open-Meteo pour la météo et l’altitude, OpenStreetMap et OpenTopoMap pour les cartes et la recherche de terrains, le service de notification de ton navigateur pour les rappels. Leur disponibilité ne dépend pas de nous, et leurs propres conditions s’appliquent. Tu peux déconnecter Strava à tout moment.</p>
      <h2>Tes données et ton contenu</h2>
      <p>Tes données sont enregistrées sur nos serveurs, comme décrit dans la <a href="/confidentialite">politique de confidentialité</a>. Elles restent les tiennes : tu peux les exporter au format JSON et supprimer ton compte à tout moment depuis la rubrique Compte. Nous les utilisons seulement pour faire fonctionner le service.</p>
      <h2>Usage interdit</h2>
      <p>Il est interdit de tenter d’accéder aux comptes ou aux données d’autres personnes, de perturber ou de surcharger le service, d’en automatiser l’usage pour contourner ses limites, ou de l’utiliser à des fins illégales.</p>
      <h2>Disponibilité et responsabilité</h2>
      <p>Nous faisons notre possible pour que Trail Pilot fonctionne correctement et sans interruption, sans pouvoir le garantir : maintenance, panne ou service tiers indisponible peuvent l’interrompre. Dans les limites prévues par la loi, l’éditeur n’est pas responsable des conséquences de ta pratique sportive ni des décisions que tu prends à partir des informations de l’appli.</p>
      <h2>Suspension et fin</h2>
      <p>Tu peux supprimer ton compte quand tu veux. Nous pouvons suspendre ou supprimer un compte en cas de manquement grave à ces conditions, après t’avoir prévenu sauf urgence. Le service peut évoluer ou s’arrêter ; dans ce cas, tu seras prévenu à l’avance pour pouvoir exporter tes données.</p>
      <h2>Propriété intellectuelle</h2>
      <p>Les textes, illustrations, graphismes et le code de Trail Pilot appartiennent à l’éditeur, sauf mention contraire (cartes © contributeurs OpenStreetMap et OpenTopoMap). Ils ne peuvent pas être copiés ou réutilisés sans autorisation.</p>
      <h2>Modification des conditions</h2>
      <p>En cas de changement important, tu seras informé dans l’appli ou par e-mail avant son entrée en vigueur. Si tu n’es pas d’accord, tu peux supprimer ton compte.</p>
      <h2>Droit applicable et litiges</h2>
      <p>Ces conditions sont soumises au droit français. En cas de problème, écris-nous d’abord à <a href={`mailto:${MAIL}?subject=R%C3%A9clamation`}>{MAIL}</a> : nous chercherons une solution amiable. À défaut, les tribunaux compétents sont ceux désignés par la loi ; si tu es consommateur, tu peux aussi saisir celui de ton domicile.</p>
      <h2>Contact</h2>
      <p><a href={`mailto:${MAIL}`}>{MAIL}</a></p>
    </LegalShell>
  );
}
