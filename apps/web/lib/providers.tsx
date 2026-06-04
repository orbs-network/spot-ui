"use client";
import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useWagmiConfig } from "./wagmi-config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryProvider } from "./query-provider";

import { Spinner } from "@/components/ui/spinner";
import dynamic from "next/dynamic";
const AppProvider = dynamic(() => import("./context").then((mod) => mod.AppProvider), { ssr: false });

const queryClient = new QueryClient();

const Fallback = () => {
  return (
    <div className="h-screen w-screen flex justify-center items-center">
      <Spinner className="size-20" />
    </div>
  );
};

const WagmiWrapper = ({ children }: { children: React.ReactNode }) => {
  const config = useWagmiConfig();
  return (
    <WagmiProvider config={config}>
      {children}
    </WagmiProvider>
  );
};

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rainbowTheme = pathname.startsWith("/utila") ? lightTheme() : darkTheme();

  return (
    <Suspense
      fallback={<Fallback />}
    >
      <QueryProvider>
        <WagmiWrapper>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider theme={rainbowTheme}>
              <AppProvider>
              {children}
              </AppProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiWrapper>
      </QueryProvider>
    </Suspense>
  );
}
