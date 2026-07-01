import "~/styles/globals.css";

import { type Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Cat-Herder — a quiet little game",
  description:
    "A zen puzzle-platformer where your cats become the world. Spend yarn, call a cat, and stand on what you summon.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

// Display face: cozy rounded, chunkier than Fredoka; true 800 for the wordmark.
const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

// Body face: warm, legible, pairs naturally with Baloo 2.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable}`}>
      <body>
        <AuthKitProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
