import { Nav, Footer } from "@/components/Chrome";
export default function LegalShell({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <Nav links={false} />
      <main className="wrap legal">
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        {children}
      </main>
      <Footer />
    </>
  );
}
