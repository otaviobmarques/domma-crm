import type { Metadata, Viewport } from "next";
import { Red_Hat_Display, Red_Hat_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

const text = Red_Hat_Text({ subsets: ["latin"], variable: "--font-text", weight: ["300", "400", "500", "600", "700"], display: "swap" });
const display = Red_Hat_Display({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"], display: "swap" });
const jet = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Domma CRM",
  description: "CRM sem código da Domma Tecnologia: boards, fases, campos, regras e automações.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32" }, { url: "/favicon-48.png", sizes: "48x48" }, { url: "/icon-192.png", sizes: "192x192" }],
    apple: "/apple-touch-icon.png",
  },
};
export const viewport: Viewport = { themeColor: "#5B3FE6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${text.variable} ${display.variable} ${jet.variable}`}>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
