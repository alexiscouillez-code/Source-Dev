import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
export const metadata: Metadata = { title: "Confidentialité", description: "Comment Trail Pilot traite tes données.", alternates: { canonical: "/confidentialite" } };
export default function Page() {
  return (
    <LegalShell kicker="Document légal" title="Politique de confidentialité">
      <p>Dernière mise à jour : 7 novembre 2026.</p>
      <h2>Ton compte</h2>
      <p>Pour créer ton espace, nous enregistrons ton adresse e-mail, ton prénom si tu l’indiques et une empreinte de ton mot de passe (jamais le mot de passe lui-même). Une session sécurisée te garde connecté 30 jours.</p>
      <h2>Tes données d’entraînement</h2>
      <p>Ta course objectif et son tracé, tes séances, tes check-in, ton profil (niveau, disponibilités, fréquences cardiaques) et ton plan sont enregistrés dans notre base de données, hébergée par Turso, pour calculer ta charge, ta VO2max estimée et ton plan. L’application est hébergée par Vercel Inc. Ces prestataires peuvent traiter les données hors de l’Union européenne, dans le cadre des garanties prévues par le RGPD.</p>
      <h2>Strava</h2>
      <p>Si tu connectes Strava, nous lisons uniquement tes activités (date, sport, durée, distance, dénivelé, fréquence cardiaque). Les jetons d’accès sont chiffrés. Tu peux déconnecter Strava à tout moment depuis ton compte.</p>
      <h2>Fichiers importés</h2>
      <p>Les fichiers GPX, FIT ou TCX que tu importes sont lus directement dans ton navigateur. Seuls les chiffres calculés (distance, dénivelé, durée, fréquence cardiaque) et un tracé GPS simplifié, pour la carte de tes sorties, sont conservés. Pour ta course, nous gardons le tracé simplifié et son profil (distance et altitude). Les tracés Strava sont gardés de la même façon.</p>
      <h2>Données de santé</h2>
      <p>Quand tu signales une douleur au check-in, tu peux indiquer où elle se situe. Cette information est une donnée de santé : elle n’est enregistrée qu’avec ton accord explicite, sert uniquement à adapter tes séances et l’X-Ray, et n’est jamais partagée. Il en va de même pour la fréquence cardiaque au réveil et la variabilité cardiaque (VFC) que tu peux saisir au check-in ; la durée de sommeil est enregistrée sans condition. Tu peux retirer ton accord dans ton compte : zones douloureuses, FC au réveil et VFC sont alors effacées.</p>
      <h2>Notifications et e-mails</h2>
      <p>Si tu actives le rappel du check-in, ton navigateur nous fournit une adresse d’envoi propre à ton appareil, transmise au service de notification de ton navigateur (Apple, Google ou Mozilla) à chaque rappel. Les e-mails de confirmation d’adresse et de mot de passe oublié sont envoyés par Resend.</p>
      <h2>Coach IA</h2>
      <p>Quand tu poses une question au coach, ta question et un résumé de tes données d’entraînement (profil, course, plan, charge, check-in du jour, séances récentes) sont transmis à Anthropic, qui fournit le modèle d’IA, pour produire la réponse. Selon ses conditions commerciales, Anthropic n’utilise pas par défaut ces données pour entraîner ses modèles. La conversation est gardée dans ton compte et tu peux l’effacer à tout moment.</p>
      <h2>Météo, carte et agenda</h2>
      <p>Pour la météo du jour de course, les coordonnées du lieu de départ sont envoyées à Open-Meteo. Les fonds de carte sont chargés depuis OpenStreetMap et OpenTopoMap, qui reçoivent l’adresse IP de ton appareil comme tout site consulté. Si tu relies ton agenda, ton planning est lisible à une adresse secrète que toi seul connais ; tu peux la désactiver ou la renouveler dans ton compte.</p>
      <h2>Mode hors ligne</h2>
      <p>Pour rester consultable sans réseau, l’appli garde une copie de tes dernières données sur ton appareil. Elle est effacée quand tu te déconnectes.</p>
      <h2>Mesure d’audience et erreurs</h2>
      <p>Nous utilisons Vercel Web Analytics, qui mesure la fréquentation des pages sans cookie et sans identifier les visiteurs. En cas d’erreur technique, nous enregistrons le message d’erreur et la page concernée pendant 30 jours pour la corriger.</p>
      <h2>Durée de conservation</h2>
      <p>Tes données sont conservées tant que ton compte existe. Tu peux les exporter au format JSON ou supprimer définitivement ton compte et toutes tes données depuis ton espace, rubrique Compte.</p>
      <h2>Tes droits</h2>
      <p>Tu disposes d’un droit d’accès, de rectification, d’effacement, de portabilité et d’opposition. Pour toute question ou demande relative à tes données : <a href="mailto:alexiscou@outlook.fr?subject=Donn%C3%A9es%20personnelles">alexiscou@outlook.fr</a>. Tu peux aussi saisir la CNIL.</p>
    </LegalShell>
  );
}
