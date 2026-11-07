import "./site.css";
import "./fixes.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-root">{children}</div>;
}
