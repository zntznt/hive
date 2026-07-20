import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

// Nunito Sans + Baloo 2, self-hosted from public/fonts/ (see globals.css
// @font-face). next/font/google needs a build-time fetch that isn't reliable
// in this project's offline/CI build, so the woff2 files are vendored once
// instead and referenced by CSS variable here.

export const metadata: Metadata = {
  title: "Hive · tu club, organizado",
  description:
    "Eventos de club sin caos: fecha, confirmaciones, quién trae qué, gastos y encuestas en un solo enlace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-cream text-ink-700 font-body">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
