import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { GameProvider } from "@/components/GameProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trail Survival",
  description: "Jeu de gestion d’une course de trail. Courses fictives.",
  applicationName: "Trail Survival",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trail Survival",
  },
};

export const viewport: Viewport = {
  themeColor: "#07090c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#07090c] text-zinc-100">
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
