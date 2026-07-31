import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import Chrome from "./chrome";

// Nunito Sans + Baloo 2, self-hosted from public/fonts/ (see globals.css
// @font-face). next/font/google needs a build-time fetch that isn't reliable
// in this project's offline/CI build, so the woff2 files are vendored once
// instead and referenced by CSS variable here.

export const metadata: Metadata = {
  title: "Hive · tu club, organizado",
  description:
    "Eventos de club sin caos: fecha, confirmaciones, quién trae qué, gastos y encuestas en un solo enlace.",
  manifest: "/assets/pwa/manifest.webmanifest",
  // iOS ignores the manifest for this, so the home-screen icon and the
  // standalone chrome have to be declared here as well.
  appleWebApp: { capable: true, title: "Hive", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/assets/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

// honey-500 tints the Android status bar and the task-switcher card; paper is
// the splash field, matching the app's own background so launching does not
// flash white and then settle into cream.
export const viewport: Viewport = {
  themeColor: "#EBA937",
  // the app is a column of at most 460px and the tab bar is fixed, so a
  // pinch-zoomed layout has nothing to reveal and everything to break
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-cream text-ink-700 font-body">
        {/* 92px of clearance for the fixed tab bar belongs here, not to each
            page, so a new screen cannot forget it and hide its own last row. */}
        <ToastProvider>
          <div className="flex-1 pb-[92px]">{children}</div>
          <Chrome />
        </ToastProvider>
      </body>
    </html>
  );
}
