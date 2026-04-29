import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Cat Herder",
  description: "Herd cats. Powered by WorkOS AuthKit.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <AuthKitProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
