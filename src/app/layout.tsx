import "@/styles/globals.css";

import { Gemunu_Libre } from "next/font/google";
import { type Metadata } from "next";

import { TRPCReactProvider } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";
import { GoogleAdsense } from "@/components/GoogleAdsense";
import { env } from "@/env";
import React from "react";

export const metadata: Metadata = {
  title: "Audiobook Covers",
  description: "Browse custom audiobook cover artwork",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const gemunu = Gemunu_Libre({
  subsets: ["latin"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={gemunu.className}>
      <body>
        <TRPCReactProvider>
          <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
            <div className="my-6 flex flex-row justify-center gap-2">
              <Button asChild variant="ghost">
                <Link href="/" className="text-3xl">
                  Home
                </Link>
              </Button>

              <Button asChild variant="ghost">
                <Link href="/image/search/" className="text-3xl">
                  Search
                </Link>
              </Button>

              <Button asChild variant="ghost">
                <Link href="/about/" className="text-3xl">
                  About
                </Link>
              </Button>

              <Button asChild variant="ghost">
                <Link href="/apidocs/" className="text-3xl">
                  API
                </Link>
              </Button>

              <Button asChild variant="ghost">
                <Link href="/contribute/" className="text-3xl">
                  Contribute
                </Link>
              </Button>
            </div>
            <div className="min-h-screen">{children}</div>
          </div>
        </TRPCReactProvider>
        <GoogleAnalytics gaId={env.GOOGLE_ANALYTICS_ID} />
      </body>
      <GoogleAdsense />
    </html>
  );
}
