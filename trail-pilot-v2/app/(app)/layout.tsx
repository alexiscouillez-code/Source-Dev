import "./app.css";
import "./plan.css";
import "./xray.css";
import "./motion.css";
import "./infotip.css";
import "./features.css";
import "./features2.css";
import "./terrains.css";
import "./motion2.css";
import "./graphcards.css";
import ErrorReporter from "@/components/ErrorReporter";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <><ErrorReporter />{children}</>;
}
