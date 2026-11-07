import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export function Logo() {
  return (
    <Link className="logo" href="/" aria-label="Trail Pilot, accueil">
      <svg viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#1b2631" />
        <path d="M96 372 C170 360 196 300 236 300 C280 300 280 222 320 196" fill="none" stroke="#ff6a2b" strokeWidth="30" strokeLinecap="round" />
        <circle cx="320" cy="196" r="30" fill="#f4efe6" />
      </svg>
      <span>TRAIL PILOT</span>
    </Link>
  );
}

export function Nav({ links = true }: { links?: boolean }) {
  return (
    <header className="nav">
      <Logo />
      {links && (
        <nav className="nav-links" aria-label="Navigation principale">
          <a href="/#decision">Le check-in</a>
          <a href="/#outils">Les outils</a>
          <a href="/#demarrer">Démarrer</a>
          <a href="/#faq">Questions</a>
        </nav>
      )}
      <div className="nav-right">
        <ThemeToggle />
        <a className="btn" href="/connexion">Mon espace <span className="arr">↗</span></a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-row">
          <Logo />
          <nav aria-label="Liens légaux">
            <Link href="/cgu">CGU</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/mentions-legales">Mentions légales</Link>
            <a href="mailto:alexiscou@outlook.fr?subject=Trail%20Pilot">Contact</a>
          </nav>
        </div>
        <small>Trail Pilot est un outil d’aide à la préparation, pas un avis médical. © {new Date().getFullYear()} Trail Pilot.</small>
      </div>
    </footer>
  );
}
