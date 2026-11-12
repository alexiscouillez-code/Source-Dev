import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
export const metadata: Metadata = { title: "Confidentialité", description: "Comment Trail Pilot traite tes données.", alternates: { canonical: "/confidentialite" } };
const MAIL = "alexiscou@outlook.fr";
export default function Page() {
  return (
    <LegalShell kicker="Document légal" title="Politique de confidentialité">
      <p>Dernière mise à jour : 7 novembre 2026.</p>
      <h2>Responsable du traitement</h2>
      <p>Alexis Couillez, éditeur de Trail Pilot. Contact pour toute question sur tes données : <a href={`mailto:${MAIL}?subject=Donn%C3%A9es%20personnelles`}>{MAIL}</a>. Le service est réservé aux personnes de 18 ans et plus.</p>
      <h2>Ton compte</h2>
      <p>Pour créer ton espace, nous enregistrons ton adresse e-mail, ton prénom si tu l’indiques et une empreinte de ton mot de passe (jamais le mot de passe lui-même). Base légale : l’exécution du service que tu demandes.</p>
      <h2>Tes données d’entraînement</h2>
      <p>Ta course objectif et son tracé, tes séances, tes check-in, ton profil (niveau, disponibilités, fréquences cardiaques) et ton plan sont enregistrés pour calculer ta charge, ta VO2max estimée, tes allures et ton plan. Base légale : l’exécution du service. Les fréquences cardiaques peuvent révéler des informations sur ta santé : elles ne servent qu’à ces calculs, ne sont jamais vendues ni utilisées pour de la publicité, et tu peux les modifier ou les effacer à tout moment.</p>
      <h2>Données de santé</h2>
      <p>Au check-in, tu peux indiquer où se situe une douleur, ta fréquence cardiaque au réveil et ta variabilité cardiaque (VFC). Ce sont des données de santé : elles ne sont enregistrées qu’avec ton accord explicite, servent uniquement à adapter tes séances et l’X-Ray, et ne sont jamais partagées. La durée de sommeil est enregistrée sans condition. Les commentaires libres (check-in ou jour du calendrier) sont enregistrés tels que tu les écris et affichés dans ton calendrier. À chaque enregistrement, le texte du commentaire, et lui seul, est transmis au service d’IA (Groq) pour y repérer fatigue, douleur, maladie ou manque de temps et adapter ta séance ; il est aussi joint au check-in du jour quand tu poses une question au coach. N’y écris que ce que tu acceptes de voir traité ainsi ; un commentaire vide ou supprimé n’est pas transmis. Tu peux retirer ton accord à tout moment dans ton compte : zones douloureuses, FC au réveil et VFC sont alors effacées.</p>
      <h2>Strava</h2>
      <p>Si tu connectes Strava (avec ton accord), nous lisons uniquement tes activités : date, sport, durée, distance, dénivelé, fréquence cardiaque et tracé simplifié. Les jetons d’accès sont chiffrés. La synchronisation se fait automatiquement à l’ouverture de l’appli et une fois chaque matin. Tu peux déconnecter Strava à tout moment depuis ton compte.</p>
      <h2>Fichiers importés</h2>
      <p>Les fichiers GPX, FIT ou TCX que tu importes sont lus directement dans ton navigateur. Seuls les chiffres calculés (distance, dénivelé, durée, fréquence cardiaque) et un tracé GPS simplifié, pour la carte de tes sorties, sont conservés. Pour ta course, nous gardons le tracé simplifié et son profil (distance et altitude).</p>
      <h2>Coach IA</h2>
      <p>Quand tu poses une question au coach, ta question et un résumé de tes données d’entraînement (profil, course, plan, charge, check-in du jour, séances récentes) sont transmis à Groq LLC (États-Unis), qui fait tourner le modèle d’IA, pour produire la réponse. Selon ses conditions, Groq ne conserve pas ces données, hormis des journaux temporaires (30 jours au plus) en cas d’incident technique ou d’abus. La conversation est gardée dans ton compte et tu peux l’effacer à tout moment. Base légale : ton consentement, puisque tu choisis d’utiliser le coach.</p>
      <h2>Notifications et e-mails</h2>
      <p>Si tu actives le rappel du check-in (avec ton accord), ton navigateur nous fournit une adresse d’envoi propre à ton appareil, transmise au service de notification de ton navigateur (Apple, Google ou Mozilla) à chaque rappel. Les e-mails de confirmation d’adresse et de mot de passe oublié sont envoyés par Resend.</p>
      <h2>Météo, carte et agenda</h2>
      <p>Pour la météo du jour de course et celle de tes séances, les coordonnées du lieu de départ et de ton lieu d’entraînement (si tu en choisis un) sont envoyées à Open-Meteo. Les fonds de carte sont chargés depuis OpenStreetMap et OpenTopoMap, qui reçoivent l’adresse IP de ton appareil comme tout site consulté. Si tu relies ton agenda, ton planning est lisible à une adresse secrète que toi seul connais ; tu peux la désactiver ou la renouveler dans ton compte.</p>
      <h2>Recherche de terrains</h2>
      <p>Quand tu cherches un terrain, ton appareil télécharge directement les tuiles de carte d’OpenFreeMap (données OpenStreetMap) et les tuiles d’altitude du stockage de données ouvertes d’Amazon Web Services, et en secours interroge Open-Meteo, avec les coordonnées du secteur choisi (ta position, si tu l’autorises, un lieu ou un point de la carte), pour lire les chemins et l’altitude. Comme pour tout site consulté, ces services reçoivent l’adresse IP de ton appareil, mais ni ton nom ni ton adresse e-mail. Ta position n’est demandée qu’au moment où tu touches « Ma position » ; elle n’est pas envoyée à Trail Pilot, et seul le dernier point de départ est gardé sur ton appareil. Les terrains que tu enregistres sont conservés dans ton compte jusqu’à ce que tu les supprimes.</p>
      <h2>Cookies et stockage sur ton appareil</h2>
      <p>Trail Pilot utilise un seul cookie, indispensable pour te garder connecté (30 jours). Il n’y a ni cookie publicitaire ni traceur, donc pas de bandeau à accepter. Pour rester consultable sans réseau, l’appli garde aussi une copie de tes dernières données sur ton appareil ; elle est effacée quand tu te déconnectes.</p>
      <h2>Mesure d’audience et erreurs</h2>
      <p>Nous utilisons Vercel Web Analytics, qui mesure la fréquentation des pages sans cookie et sans identifier les visiteurs. En cas d’erreur technique, nous enregistrons le message d’erreur et la page concernée pendant 30 jours pour la corriger. Base légale : notre intérêt légitime à faire fonctionner et améliorer le service.</p>
      <h2>Qui reçoit tes données</h2>
      <p>Seuls l’éditeur et les prestataires nécessaires au service y ont accès : Vercel (hébergement de l’application), Turso (base de données), Resend (e-mails), Groq (coach IA), et, selon ce que tu actives, Strava, Open-Meteo, OpenFreeMap, les tuiles d’altitude d’Amazon Web Services et le service de notification de ton navigateur. Tes données ne sont jamais vendues ni utilisées pour de la publicité.</p>
      <h2>Transferts hors de l’Union européenne</h2>
      <p>Ces prestataires sont en partie établis aux États-Unis. Les transferts reposent sur le cadre de protection des données UE–États-Unis (Data Privacy Framework) lorsque le prestataire y adhère, comme Vercel, ou sur les clauses contractuelles types de la Commission européenne.</p>
      <h2>Durée de conservation</h2>
      <p>Tes données sont conservées tant que ton compte existe, puis effacées dès sa suppression. Les journaux d’erreurs sont gardés 30 jours. Tu peux exporter tes données au format JSON ou supprimer définitivement ton compte et toutes tes données depuis ton espace, rubrique Compte.</p>
      <h2>Tes droits</h2>
      <p>Tu disposes d’un droit d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition, ainsi que du droit de retirer ton consentement à tout moment, sans remettre en cause ce qui a été fait avant. Tu peux aussi définir des directives sur le sort de tes données après ton décès. Écris à <a href={`mailto:${MAIL}?subject=Donn%C3%A9es%20personnelles`}>{MAIL}</a> : nous répondons sous un mois. Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (<a href="https://www.cnil.fr/fr/plaintes" rel="noreferrer">cnil.fr</a>).</p>
    </LegalShell>
  );
}
