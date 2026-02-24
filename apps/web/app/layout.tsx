import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Navigation } from "@/components/navigation";

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
            <Toaster />
            <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
              <Navigation />
              <div className="flex flex-1 items-center justify-center">
                {children}
              </div>
            </div>
          </Providers>

      </body>
    </html>
  );
}
