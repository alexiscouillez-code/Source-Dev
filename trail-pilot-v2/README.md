# Trail Pilot

Coach d’entraînement pour le trail : check-in du soir, plan jusqu’à la course, stratégie de course, X-Ray, profil trail, coach IA.
En ligne : https://trail-pilot-v2.vercel.app

Projet Next.js indépendant du reste de ce dépôt (ses propres dépendances).

```bash
cd trail-pilot-v2
npm install
TURSO_DATABASE_URL=file:local.db AUTH_SECRET=une-longue-valeur-aleatoire npm run dev
```

Variables d’environnement (sur Vercel) :
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET` : base de données et sessions.
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` : connexion Strava.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` : rappel du check-in.
- `RESEND_API_KEY`, `MAIL_FROM` : e-mails (facultatif).
- `ANTHROPIC_API_KEY`, `COACH_MODEL` : coach IA (facultatif).

Aucun secret n’est enregistré dans ce dossier.
