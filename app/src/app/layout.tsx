import type { Metadata } from "next";
import "./globals.css";

// ponytail: system font stack instead of next/font/google - no build-time font
// fetch (which fails offline/CI). Swap to next/font/local + a vendored Figtree
// .woff2 if the brand needs that exact face. Stack mirrors the candidates in
// docs/08 (humanist, slightly rounded).
const fontStack =
  'ui-rounded, "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

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
    <html lang="es" className="h-full antialiased" style={{ fontFamily: fontStack }}>
      <body className="min-h-full flex flex-col bg-[#FBF7EF] text-stone-800">
        {children}
      </body>
    </html>
  );
}
