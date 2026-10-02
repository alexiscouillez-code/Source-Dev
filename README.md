# Trail Survival

Jeu de gestion d’une course de trail. Les courses sont fictives. Le moteur déterministe, dans `src/game`, est la source de vérité. L’interface affiche son état.

```bash
npm install
npm test
npm run dev
```

La progression (coureur, équipement, XP, historique, course en cours) est enregistrée dans le navigateur et survit à un rafraîchissement.

`supabase/schema.sql` décrit les tables pour une synchro ultérieure. Sans identifiants Supabase, aucun compte cloud n’est créé et rien n’est envoyé.

Le coach IA (`/api/coach`) explique un `RaceResult` déjà calculé si `GEMINI_API_KEY` est défini. Sans cette variable, il le dit et n’invente pas de conseil. Il ne calcule ni l’arrivée, ni l’XP, ni les probabilités.
