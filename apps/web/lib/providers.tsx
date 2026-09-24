"use client";
import React, { Suspense } from "react";
import { wagmiConfig } from "./wagmi-config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PartnerWalletProvider } from "./partner-wallet-provider";
import { WagmiProvider } from "wagmi";
import { QueryProvider } from "./query-provider";
import { WalletReconnect } from "./wallet-reconnect";

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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<Fallback />}
    >
      <QueryProvider>
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
          <QueryClientProvider client={queryClient}>
            <WalletReconnect />
            <PartnerWalletProvider>
              <AppProvider>
              {children}
              </AppProvider>
            </PartnerWalletProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </QueryProvider>
    </Suspense>
  );
}
