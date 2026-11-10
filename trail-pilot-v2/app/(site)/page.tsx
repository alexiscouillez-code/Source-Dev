import Hero from "@/components/Hero";
import Decision from "@/components/Decision";
import MotionRoot from "@/components/MotionRoot";
import { Nav, Footer } from "@/components/Chrome";
import { SITE_URL, SITE_DESC } from "@/lib/site";
import { PHOTOS } from "@/lib/photos";

const BARS = [38, 52, 44, 70, 30, 0, 62, 48, 58, 76, 40, 0, 88, 54];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Trail Pilot",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web, iOS, Android",
  inLanguage: "fr-FR",
  description: SITE_DESC,
  url: SITE_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a className="skip" href="#contenu">Aller au contenu</a>
      <Nav />
      <MotionRoot />

      <main id="contenu">
        <Hero />

        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {Array.from({ length: 2 }).flatMap((_, k) =>
              ["Préparer", "Explorer", "Progresser", "Récupérer"].map((w) => <span key={`${k}-${w}`}>{w}</span>),
            )}
          </div>
        </div>

        <Decision />

        <section className="sec" id="outils" aria-labelledby="outils-title">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">Tout ce qu’il faut, rien de plus</span>
              <h2 id="outils-title" className="mask">Moins de tableaux. <em>Plus de sentiers.</em></h2>
              <p className="reveal" style={{ ["--d" as string]: "120ms" }}>Les montres te donnent cinquante chiffres. Trail Pilot n’en garde que trois, et te dit quoi en faire.</p>
            </div>

            <div className="features">
              <article className="fcard reveal" data-io>
                <span className="mono" style={{ color: "var(--ember-t, var(--ember))" }}>01 · Planifier</span>
                <h3>Ta course en ligne de mire.</h3>
                <p>Renseigne ton objectif : un planning sur trois semaines, la phase de prépa et l’affûtage s’ajustent tout seuls.</p>
                <div className="fviz">
                  <svg viewBox="0 0 320 170" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#ff6a2b" stopOpacity=".45" />
                        <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 150 L30 132 L60 140 L95 96 L130 110 L165 52 L200 74 L235 30 L270 66 L320 48 L320 170 L0 170 Z" fill="url(#elev)" opacity=".7" />
                    <path className="draw" d="M0 150 L30 132 L60 140 L95 96 L130 110 L165 52 L200 74 L235 30 L270 66 L320 48" fill="none" stroke="#ff6a2b" strokeWidth="3" strokeLinejoin="round" />
                    <line x1="235" y1="30" x2="235" y2="170" stroke="#f4efe6" strokeDasharray="3 5" opacity=".4" />
                    <text x="242" y="24" fill="#f4efe6" fontSize="11" fontFamily="monospace">J-0</text>
                  </svg>
                </div>
                <div className="tag-row"><span className="tag">Planning</span><span className="tag">Affûtage</span></div>
              </article>

              <article className="fcard reveal" data-io style={{ ["--d" as string]: "120ms" }}>
                <span className="mono" style={{ color: "var(--ember-t, var(--ember))" }}>02 · Importer</span>
                <h3>Strava, ou ta trace GPX.</h3>
                <p>Connecte Strava : chaque sortie arrive toute seule dans ton journal. Une trace GPX ? Distance et dénivelé calculés en un instant.</p>
                <div className="fviz">
                  <svg viewBox="0 0 320 170">
                    <g stroke="#1b2631" strokeWidth="1">
                      {Array.from({ length: 9 }).map((_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="170" />)}
                      {Array.from({ length: 5 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 40} x2="320" y2={i * 40} />)}
                    </g>
                    <path d="M40 140 C70 120 90 70 130 60 C170 50 190 90 230 80 C270 70 290 30 280 20" fill="none" stroke="#26333f" strokeWidth="10" strokeLinecap="round" />
                    <path className="draw" d="M48 132 C80 110 96 74 130 66 C168 56 186 100 226 92 C262 84 282 50 266 34 C246 16 196 40 168 70 C140 100 98 150 48 132" fill="none" stroke="#ff6a2b" strokeWidth="3.5" strokeLinecap="round" />
                    <circle cx="48" cy="132" r="6" fill="#f4efe6" />
                  </svg>
                </div>
                <div className="tag-row"><span className="tag">Strava</span><span className="tag">GPX</span></div>
              </article>

              <article className="fcard reveal" data-io style={{ ["--d" as string]: "240ms" }}>
                <span className="mono" style={{ color: "var(--ember-t, var(--ember))" }}>03 · Comprendre</span>
                <h3>Ta charge, lisible.</h3>
                <p>Durée, ressenti, fréquence cardiaque et dénivelé. Forme, fatigue et fraîcheur : tu vois venir le pic avant qu’il te tombe dessus.</p>
                <div className="fviz">
                  <div className="bars">
                    {BARS.map((h, k) => (
                      <i key={k} className={h > 80 ? "hi" : ""} style={{ ["--h" as string]: `${Math.max(h, 3)}%`, ["--k" as string]: k }} />
                    ))}
                  </div>
                </div>
                <div className="tag-row"><span className="tag">Forme · fatigue</span><span className="tag">Alerte surcharge</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="band" aria-label="Citation">
          <div className="band-media" aria-hidden="true"><img src={PHOTOS.ridge.src} alt="" loading="lazy" decoding="async" /></div>
          <div className="wrap band-copy">
            <span className="kicker reveal">Philosophie</span>
            <blockquote className="reveal" style={{ ["--d" as string]: "100ms" }}>Le terrain impose le rythme. <em>Toi, tu doses l’effort.</em></blockquote>
            <small>Photo : {PHOTOS.ridge.author} / Unsplash</small>
          </div>
        </section>

        <section aria-label="Trail Pilot en chiffres">
          <div className="wrap numbers">
            <div className="num" data-count="10" data-suffix=" s"><b data-n>0 s</b><span>pour le check-in du soir</span></div>
            <div className="num" data-count="3"><b data-n>0</b><span>réponses possibles : OK, allège, récup</span></div>
            <div className="num" data-count="0" data-suffix=" €"><b data-n>0 €</b><span>aucune carte bancaire, jamais demandée</span></div>
          </div>
        </section>

        <section className="sec" id="demarrer" aria-labelledby="steps-title">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">Trois étapes</span>
              <h2 id="steps-title" className="mask">En route en <em>deux minutes.</em></h2>
            </div>
            <div className="steps">
              <div className="steps-line" aria-hidden="true"><b /></div>
              <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li className="step">
                <span className="dot">01</span>
                <div><h3>Fixe ton objectif</h3><p>Le nom de ta course, sa date, sa distance et son dénivelé. Pas d’objectif ? Trail Pilot te garde simplement en forme.</p></div>
              </li>
              <li className="step">
                <span className="dot">02</span>
                <div><h3>Connecte Strava</h3><p>Tes 120 derniers jours sont importés, puis chaque nouvelle sortie. Pas de Strava ? Une saisie rapide ou un GPX suffit.</p></div>
              </li>
              <li className="step">
                <span className="dot">03</span>
                <div><h3>Check-in, puis décision</h3><p>Sommeil, jambes, motivation, douleur. Ta consigne pour demain, et ton planning s’adapte.</p></div>
              </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="sec" style={{ paddingTop: 0 }} aria-labelledby="free-title">
          <div className="wrap free">
            <div className="free-card accent reveal">
              <span className="mono">Prix</span>
              <b id="free-title">0 €</b>
              <div>
                <p style={{ margin: "0 0 18px", fontSize: 19 }}>Tout est gratuit. Pas d’abonnement, pas de version bridée.</p>
                <a className="btn" href="/connexion?mode=inscription">Ouvrir mon espace <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="free-card reveal" style={{ ["--d" as string]: "120ms" }}>
              <ul>
                <li>Check-in du soir et décision du lendemain</li>
                <li>Import automatique depuis Strava, ou trace GPX</li>
                <li>Moteur de charge : forme, fatigue, fraîcheur</li>
                <li>Planning sur 3 semaines, recalculé selon ta forme</li>
                <li>Tes données t’appartiennent, exportables à tout moment</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="sec" id="faq" style={{ paddingTop: 0 }} aria-labelledby="faq-title">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">Questions</span>
              <h2 id="faq-title" className="mask">Avant de <em>partir.</em></h2>
            </div>
            <div className="faq">
              <details className="reveal"><summary>Faut-il créer un compte ?</summary><p>Oui, un compte gratuit avec ton e-mail : ton espace te suit sur téléphone et ordinateur. Tu peux exporter ou supprimer tes données à tout moment.</p></details>
              <details className="reveal"><summary>Comment est prise la décision ?</summary><p>Trail Pilot combine ton check-in (sommeil, jambes, motivation, douleur) et l’évolution de ta charge sur 7 jours et 6 semaines. Une douleur marquée mène toujours à la récupération. Chaque décision affiche ses raisons.</p></details>
              <details className="reveal"><summary>Que lit Trail Pilot sur Strava ?</summary><p>Uniquement tes activités : date, durée, distance, dénivelé, fréquence cardiaque. Rien n’est publié sur ton compte, et tu peux déconnecter Strava en un clic.</p></details>
              <details className="reveal"><summary>Ça marche sur téléphone ?</summary><p>Oui. Ajoute Trail Pilot à ton écran d’accueil depuis ton navigateur : il s’ouvre en plein écran, comme une application.</p></details>
              <details className="reveal"><summary>Est-ce que ça remplace un coach ou un médecin ?</summary><p>Non. Trail Pilot t’aide à doser ton entraînement au quotidien. En cas de douleur qui persiste, consulte un professionnel de santé.</p></details>
            </div>
          </div>
        </section>

        <section className="final" data-io aria-labelledby="final-title">
          <div className="final-bg" aria-hidden="true"><img src={PHOTOS.dolomites.src} alt="" loading="lazy" decoding="async" /></div>
          <div className="wrap">
            <span className="kicker reveal">Ce soir</span>
            <h2 id="final-title" className="mask" style={{ marginTop: 20 }}>Ton prochain sommet<br />se prépare <span className="out">ce soir.</span></h2>
            <a className="btn" href="/connexion?mode=inscription">Faire mon premier check-in <span className="arr">↗</span></a>
            <p>Gratuit · compatible Strava · mobile et ordinateur</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
