import type { Metadata } from "next";
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
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
