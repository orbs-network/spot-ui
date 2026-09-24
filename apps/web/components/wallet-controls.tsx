"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDownIcon, NetworkIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

export function WalletControls() {
  return (
    <>
      {/* RainbowKit's default trigger hides when only one chain is available. */}
      <ConnectButton.Custom>
        {({ mounted, account, chain, openChainModal, chainModalOpen }) =>
          mounted && account && chain ? (
            <Button
              type="button"
              variant={chain.unsupported ? "destructive" : "secondary"}
              size="lg"
              className="min-w-0 max-w-48 shrink rounded-xl text-base font-bold"
              aria-label="Chain Selector"
              aria-haspopup="dialog"
              aria-expanded={chainModalOpen}
              onClick={openChainModal}
            >
              {!chain.unsupported && (
                <Avatar
                  key={chain.id}
                  className="size-6"
                  style={{ background: chain.iconBackground }}
                  aria-hidden="true"
                >
                  <AvatarImage src={chain.iconUrl} alt="" />
                  <AvatarFallback><NetworkIcon className="size-4" /></AvatarFallback>
                </Avatar>
              )}
              <span className="truncate">
                {chain.unsupported ? "Wrong network" : chain.name ?? "Network"}
              </span>
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      </ConnectButton.Custom>
      <ConnectButton showBalance={false} chainStatus="none" />
    </>
  );
}
