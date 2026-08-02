import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import Chrome from "./chrome";
import { LangProvider } from "@/components/ui/LangProvider";
import { currentLang } from "@/lib/current-lang";
import { t } from "@/lib/lang";

// Nunito Sans + Baloo 2, self-hosted from public/fonts/ (see globals.css
// @font-face). next/font/google needs a build-time fetch that isn't reliable
// in this project's offline/CI build, so the woff2 files are vendored once
// instead and referenced by CSS variable here.

// The page description is copy, so it follows the language like everything
// else. generateMetadata runs per request, which is what lets it.
export async function generateMetadata(): Promise<Metadata> {
  const lang = await currentLang()
  return {
  title: t(lang, 'app.title'),
  description:
    t(lang, 'app.description'),
  manifest: "/assets/pwa/manifest.webmanifest",
  // iOS ignores the manifest for this, so the home-screen icon and the
  // standalone chrome have to be declared here as well. Without the
  // apple-touch-icon, iOS screenshots the page and puts that on the home
  // screen. statusBarStyle stays "default": black-translucent slides the app's
  // cream up under the clock.
  appleWebApp: { capable: true, title: "Hive", statusBarStyle: "default" },
  icons: {
    // 16 is a different drawing from 32, not a resize of it, so both ship.
    icon: [
      { url: "/assets/pwa/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/assets/pwa/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: [{ url: "/assets/pwa/favicon-48.png", sizes: "48x48", type: "image/png" }],
    apple: [{ url: "/assets/pwa/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  // Next emits the standardised "mobile-web-app-capable" for appleWebApp.capable,
  // which iOS only started reading in 16.4. Older iPhones need the prefixed
  // spelling, and standalone is what gates web push there, so both ship.
  other: { "apple-mobile-web-app-capable": "yes" },
  }
}

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved once, here, and handed to every client component below. Reading
  // navigator.language further down would let the shell and the rows disagree
  // for a paint, and disagree permanently for anyone with an override.
  const lang = await currentLang();
  return (
    <html lang={lang} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-cream text-ink-700 font-body">
        {/* 92px of clearance for the fixed tab bar belongs here, not to each
            page, so a new screen cannot forget it and hide its own last row. */}
        <LangProvider lang={lang}>
        <ToastProvider>
          <div className="flex-1 pb-[92px]">{children}</div>
          <Chrome />
        </ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
