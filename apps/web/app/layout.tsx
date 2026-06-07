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
  title: "Utila Spot",
  description: "Utila Spot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoMono.variable} antialiased`}
      >
          <Providers>
            <Toaster />
            <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-hidden bg-zinc-50 font-sans">
              <Navigation />
              <div className="flex w-full min-w-0 flex-1 items-center justify-center">
                {children}
              </div>
            </div>
          </Providers>

      </body>
    </html>
  );
}
