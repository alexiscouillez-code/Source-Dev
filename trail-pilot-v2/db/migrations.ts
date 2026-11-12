// Schéma Trail Pilot. Chaque migration est appliquée une seule fois, dans une transaction.
// Ne jamais modifier une migration déjà déployée : en ajouter une nouvelle.
export const MIGRATIONS: { tag: string; statements: string[] }[] = [
  {
    tag: "001_core",
    statements: [
      `CREATE TABLE IF NOT EXISTS app_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT,
        pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS app_sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS app_auth_failures (email TEXT NOT NULL, at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS app_auth_failures_email ON app_auth_failures(email, at)`,
      `CREATE TABLE IF NOT EXISTS profiles (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        hr_max INTEGER, hr_rest INTEGER,
        days_per_week INTEGER NOT NULL DEFAULT 4,
        long_day INTEGER NOT NULL DEFAULT 6,
        max_weekly_minutes INTEGER,
        level TEXT NOT NULL DEFAULT 'regulier',
        updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS goals (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, date TEXT NOT NULL, distance_km REAL, gain_m INTEGER, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        date TEXT NOT NULL, started_at TEXT, sport TEXT NOT NULL, name TEXT,
        duration_min REAL NOT NULL, distance_km REAL, gain_m REAL, loss_m REAL,
        avg_hr REAL, max_hr REAL, rpe INTEGER,
        source TEXT NOT NULL DEFAULT 'manual', strava_id TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS activities_user_date ON activities(user_id, date)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS activities_strava ON activities(user_id, strava_id) WHERE strava_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS checkins (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, date TEXT NOT NULL,
        sleep INTEGER NOT NULL, legs INTEGER NOT NULL, motivation INTEGER NOT NULL, pain INTEGER NOT NULL,
        note TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, date))`,
      `CREATE TABLE IF NOT EXISTS plan_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        date TEXT NOT NULL, template TEXT NOT NULL, title TEXT NOT NULL, sport TEXT NOT NULL,
        duration_min INTEGER NOT NULL, gain_m INTEGER, rpe_target INTEGER NOT NULL,
        description TEXT NOT NULL, phase TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned', activity_id INTEGER, locked INTEGER NOT NULL DEFAULT 0, original TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS plan_user_date ON plan_sessions(user_id, date)`,
      `CREATE TABLE IF NOT EXISTS strava_links (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        athlete_id TEXT NOT NULL UNIQUE, athlete_name TEXT, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL, scope TEXT, last_sync_at INTEGER, last_error TEXT,
        created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
    ],
  },
  {
    tag: "002_race_plan",
    statements: [
      `ALTER TABLE goals ADD COLUMN plan_meta TEXT`,
    ],
  },
  {
    tag: "003_features",
    statements: [
      // Vérification d’adresse et réinitialisation du mot de passe
      `ALTER TABLE app_users ADD COLUMN email_verified_at INTEGER`,
      `CREATE TABLE IF NOT EXISTS app_tokens (
        token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS app_tokens_user ON app_tokens(user_id, kind)`,
      // Rappel du check-in
      `CREATE TABLE IF NOT EXISTS push_subs (
        endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id)`,
      `ALTER TABLE profiles ADD COLUMN reminder INTEGER NOT NULL DEFAULT 0`,
      // Accueil guidé, consentement santé, douleurs localisées
      `ALTER TABLE profiles ADD COLUMN onboarded_at INTEGER`,
      `ALTER TABLE profiles ADD COLUMN health_consent_at INTEGER`,
      `ALTER TABLE checkins ADD COLUMN pain_zones TEXT`,
      // Tracé de la course et ravitaillements
      `ALTER TABLE goals ADD COLUMN route TEXT`,
      // Suivi des erreurs
      `CREATE TABLE IF NOT EXISTS app_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, source TEXT NOT NULL,
        message TEXT NOT NULL, stack TEXT, url TEXT, user_id INTEGER)`,
      `CREATE INDEX IF NOT EXISTS app_errors_at ON app_errors(at)`,
    ],
  },
  {
    tag: "004_more",
    statements: [
      // Tracé GPS simplifié des sorties (polyline encodée)
      `ALTER TABLE activities ADD COLUMN track TEXT`,
      // Lieu de départ de la course (météo) quand il n’y a pas de tracé
      `ALTER TABLE goals ADD COLUMN place TEXT`,
      // Abonnement agenda (empreinte du jeton secret)
      `ALTER TABLE profiles ADD COLUMN calendar_token TEXT`,
      `CREATE UNIQUE INDEX IF NOT EXISTS profiles_calendar ON profiles(calendar_token) WHERE calendar_token IS NOT NULL`,
      // Mesures de la montre au check-in
      `ALTER TABLE checkins ADD COLUMN sleep_h REAL`,
      `ALTER TABLE checkins ADD COLUMN rhr INTEGER`,
      `ALTER TABLE checkins ADD COLUMN hrv INTEGER`,
      // Courses de préparation
      `CREATE TABLE IF NOT EXISTS side_races (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, date TEXT NOT NULL, distance_km REAL, gain_m INTEGER, priority TEXT NOT NULL DEFAULT 'B',
        created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS side_races_user ON side_races(user_id, date)`,
      // Coach IA
      `CREATE TABLE IF NOT EXISTS coach_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        role TEXT NOT NULL, content TEXT NOT NULL, at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS coach_messages_user ON coach_messages(user_id, at)`,
    ],
  },
  {
    tag: "005_terrains",
    statements: [
      // Terrains d’entraînement enregistrés (boucles, côtes, pistes…)
      `CREATE TABLE IF NOT EXISTS terrains (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, name TEXT NOT NULL, note TEXT, lat REAL NOT NULL, lon REAL NOT NULL, data TEXT NOT NULL,
        created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS terrains_user ON terrains(user_id, created_at)`,
    ],
  },
  {
    tag: "006_vo2_watch",
    // VO2max affichée par la montre du coureur (facultative)
    statements: [`ALTER TABLE profiles ADD COLUMN vo2_watch REAL`],
  },
  {
    tag: "007_activity_analysis",
    // Résumé de l’analyse seconde par seconde (zones, fenêtres d’effort stable, allure ajustée) ;
    // stream_state : NULL = à analyser, 1 = fait, 2 = flux indisponibles.
    statements: [`ALTER TABLE activities ADD COLUMN analysis TEXT`, `ALTER TABLE activities ADD COLUMN stream_state INTEGER`],
  },
  {
    tag: "008_absences_best",
    statements: [
      // Mode imprévu : maladie, blessure ou déplacement (une période active par personne).
      `CREATE TABLE IF NOT EXISTS absences (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      // Les sorties Strava déjà analysées sans meilleurs efforts sont repassées à la prochaine synchro.
      `UPDATE activities SET stream_state = NULL WHERE stream_state = 1 AND strava_id IS NOT NULL AND analysis NOT LIKE '%"best"%'`,
    ],
  },
  {
    tag: "009_learning_shoes_home",
    statements: [
      // Ce que le plan a appris du prévu / réalisé (signature des ajustements appliqués) et choix de les désactiver.
      `CREATE TABLE IF NOT EXISTS plan_learning (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        sig TEXT NOT NULL DEFAULT '', off INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`,
      // Chaussures : kilométrage, limite d’usure, paire par défaut pour la route et pour le trail.
      `CREATE TABLE IF NOT EXISTS shoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, terrain TEXT NOT NULL, base_km REAL NOT NULL DEFAULT 0, limit_km INTEGER NOT NULL DEFAULT 700,
        is_default INTEGER NOT NULL DEFAULT 0, retired INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS shoes_user ON shoes(user_id)`,
      `ALTER TABLE activities ADD COLUMN shoe_id INTEGER`,
      // Lieu d’entraînement habituel, pour corriger les allures selon la météo.
      `ALTER TABLE profiles ADD COLUMN home TEXT`,
    ],
  },
  {
    tag: "010_day_notes",
    statements: [
      // Commentaire libre d’un jour (check-in ou calendrier) et ce que l’IA y a lu (signaux), pour adapter le plan.
      `CREATE TABLE IF NOT EXISTS day_notes (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, date TEXT NOT NULL,
        note TEXT NOT NULL, signals TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, date))`,
      `INSERT OR IGNORE INTO day_notes(user_id, date, note, signals, updated_at)
         SELECT user_id, date, note, NULL, created_at FROM checkins WHERE note IS NOT NULL AND TRIM(note) != ''`,
    ],
  },
  {
    tag: "011_side_race_place",
    // Lieu de départ d’une course de préparation, pour sa météo.
    statements: [`ALTER TABLE side_races ADD COLUMN place TEXT`],
  },
  {
    tag: "012_race_debriefs",
    statements: [
      // Débrief d’une course passée : ce qui était prévu (figé à la première ouverture) et le ressenti du coureur.
      `CREATE TABLE IF NOT EXISTS race_debriefs (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, race_key TEXT NOT NULL,
        planned TEXT, rpe INTEGER, tags TEXT, note TEXT, tried INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, race_key))`,
    ],
  },
  {
    tag: "013_feedback",
    statements: [
      // Retours envoyés depuis l’appli (bouton « Un retour ? »).
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
        kind TEXT NOT NULL, page TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    ],
  },
  {
    tag: "014_share_link",
    // Lien de partage du planning en lecture seule (empreinte du jeton ; le lien chiffré est gardé dans app_kv).
    statements: [`ALTER TABLE profiles ADD COLUMN share_token TEXT`, `CREATE INDEX IF NOT EXISTS profiles_share ON profiles(share_token)`],
  },
  {
    tag: "015_fuel_gear",
    statements: [
      // Ressenti de l’alimentation testée sur une sortie longue (« passé », « limite », « pas passé ») et cible essayée.
      `CREATE TABLE IF NOT EXISTS fuel_logs (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, date TEXT NOT NULL,
        feel TEXT NOT NULL, target INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, date))`,
      // Matériel obligatoire de la course principale : [{ label, checked }].
      `ALTER TABLE goals ADD COLUMN gear TEXT`,
    ],
  },
];
