import type { Metadata } from "next";
import Script from "next/script";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nullain Agent",
  description: "Nullain Agent — assistente open source com Mastra + Ollama",
  icons: {
    icon: [
      {
        url: "/nullain/logo-light.png",
        type: "image/png",
        sizes: "1024x1024",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/nullain/logo-dark.png",
        type: "image/png",
        sizes: "1024x1024",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    shortcut: [{ url: "/nullain/logo-light.png", type: "image/png", sizes: "1024x1024" }],
    apple: [{ url: "/nullain/logo-light.png", type: "image/png", sizes: "1024x1024" }],
  },
};

// Aplica o tema salvo ANTES da primeira pintura para evitar flash de tema errado (FOUC).
const themeInitScript = `
  (function () {
    try {
      var saved = localStorage.getItem("nullain-theme");
      var dark = saved === "dark" || (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (dark) document.documentElement.classList.add("dark");
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        {/* next/script com beforeInteractive: o Next injeta no <head> antes da
            hidratação — <script> cru no body é rejeitado no Next 16/Turbopack. */}
        <Script
          id="nullain-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
