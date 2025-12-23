import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import "@rainbow-me/rainbowkit/styles.css";
import { Toaster } from "@/components/ui/sonner";


const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
});

const robotoMono = Roboto({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "dSpot",
  description: "dSpot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoMono.variable} antialiased dark`}
      >
          <Providers>
            <div className="fixed top-4 right-4 z-50">
            <ConnectButton showBalance={false} />
            </div>
            <Toaster />
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
              {children}
            </div>
          </Providers>

      </body>
    </html>
  );
}
