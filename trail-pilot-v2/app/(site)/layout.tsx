import "./site.css";
import "./fixes.css";
import "../glass-theme.css";
import "../modes.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-root">{children}</div>;
}
