"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Courir" },
  { href: "/courses", label: "Courses" },
  { href: "/runner", label: "Coureur" },
  { href: "/equipment", label: "Équipement" },
  { href: "/history", label: "Historique" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-[#07090c]/95 backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-h-16 items-center justify-center px-1 text-center text-[11px] font-semibold tracking-wide ${
                active ? "text-cyan-300" : "text-zinc-500"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
