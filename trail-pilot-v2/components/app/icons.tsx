import CapLogo from "../CapLogo";
const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
export const IconToday = () => <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IconPlan = () => <svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
export const IconRuns = () => <svg {...p}><path d="M3 18l5-7 4 4 4-8 5 11" /></svg>;
export const IconChart = () => <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const IconUser = () => <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
export const IconCheck = () => <svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconSkip = () => <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconUndo = () => <svg {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>;
export const IconTrash = () => <svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const IconPlus = () => <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const IconSync = () => <svg {...p}><path d="M20 11a8 8 0 00-14.5-4.5L4 8M4 13a8 8 0 0014.5 4.5L20 16" /><path d="M4 4v4h4M20 20v-4h-4" /></svg>;
export const IconPin = () => <svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>;
export const IconCal = () => <svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3" /></svg>;
export const IconTerrain = () => <svg {...p}><path d="M2.5 19.5l6.5-12 4.2 7.4 2.3-3.6 6 8.2z" /><path d="M7.2 11l1.8 1.6 1.7-1.4" /><circle cx="17.5" cy="5.5" r="1.8" /></svg>;
export const IconWatch = () => <svg {...p}><rect x="6.5" y="6" width="11" height="12" rx="3" /><path d="M9 6l.6-3h4.8L15 6M9 18l.6 3h4.8L15 18M12 9.5V12l1.6 1.2" /></svg>;
export const IconChat = () => <svg {...p}><path d="M4 5.5h16v10H9l-5 4z" /><path d="M8 10h8" /></svg>;
/** Logo « Le cap » (animé), partagé avec le site. */
export const Logo = () => <CapLogo />;
/** Partager : flèche qui sort d'une boîte. */
export const IconShare = () => <svg {...p}><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" /></svg>;
/** Comparer : deux colonnes et une double flèche. */
export const IconCompare = () => <svg {...p}><rect x="3" y="5" width="7" height="14" rx="2" /><rect x="14" y="5" width="7" height="14" rx="2" /><path d="M10 9h4M12.5 7.5 14 9l-1.5 1.5M14 15h-4M11.5 13.5 10 15l1.5 1.5" /></svg>;
/** Course : fanion. */
export const IconFlag = () => <svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>;
export const IconX = () => <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconSearch = () => <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
/** Bilan : un calendrier en points. */
export const IconRecap = () => <svg {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><circle cx="8" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="10" r="1.6" fill="currentColor" /><circle cx="16" cy="10" r=".8" fill="currentColor" /><circle cx="8" cy="15" r="1.8" fill="currentColor" /><circle cx="12" cy="15" r=".9" fill="currentColor" /><circle cx="16" cy="15" r="1.4" fill="currentColor" /></svg>;
/* Rubriques (listes de fiches) */
export const IconRoute = () => <svg {...p}><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 18H15a3.5 3.5 0 000-7H9a3.5 3.5 0 010-7h6.8" /></svg>;
export const IconCloud = () => <svg {...p}><path d="M7 18h10.5a4 4 0 00.4-8 6 6 0 00-11.6 1.6A3.3 3.3 0 007 18z" /><path d="M12 3.5V2M5.5 5.5l-1-1M18.5 5.5l1-1" /></svg>;
export const IconPack = () => <svg {...p}><path d="M7 8a5 5 0 0110 0v11a2 2 0 01-2 2H9a2 2 0 01-2-2z" /><path d="M10 3.5h4M7 13h10M10.5 13v3h3v-3" /></svg>;
export const IconTarget = () => <svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>;
export const IconHeart = () => <svg {...p}><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10C19.5 15.6 12 20 12 20z" /><path d="M5 12h3.5l1.5-2.5 2 5 1.5-2.5H19" /></svg>;
export const IconTrend = () => <svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
export const IconRadar = () => <svg {...p}><path d="M12 3l8 6-3 10H7L4 9z" /><path d="M12 8l4 3-1.5 4.5h-5L8 11z" /></svg>;
export const IconMore = () => <svg {...p}><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></svg>;
/** Pause : deux barres (absence). */
export const IconPause = () => <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></svg>;
/** Importer : flèche qui monte vers un plateau. */
export const IconUpload = () => <svg {...p}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" /></svg>;
