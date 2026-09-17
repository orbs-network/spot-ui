"use client";

import { useEffect } from "react";
import { useConfig, useConnectors, useReconnect } from "wagmi";

export function WalletReconnect() {
  const config = useConfig();
  // Injected wallets may be discovered after the first render.
  const connectors = useConnectors();
  const { mutate: reconnect } = useReconnect();

  useEffect(() => {
    let cancelled = false;

    async function restoreConnection() {
      const recentConnectorId = await config.storage?.getItem("recentConnectorId");
      if (
        cancelled ||
        !recentConnectorId ||
        config.state.status !== "disconnected"
      ) return;

      const connector = connectors.find(({ id }) => id === recentConnectorId);
      // Scanning every wallet can leave a restored account stuck in "connecting"
      // while an unrelated WalletConnect provider is still initializing.
      if (connector) reconnect({ connectors: [connector] });
    }

    void restoreConnection().catch(() => {
      // If saved wallet preferences cannot be read, allow a manual connection.
    });

    return () => {
      cancelled = true;
    };
  }, [config, connectors, reconnect]);

  return null;
}
