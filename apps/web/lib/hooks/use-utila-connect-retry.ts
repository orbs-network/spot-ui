import { useCallback, useEffect, useRef, useState } from "react";
import { useReconnect } from "wagmi";
import { useActiveConnection } from "./use-active-connection";

const isUtilaConnector = (connector: { id: string; name: string }) => {
  const connectorName = connector.name.toLowerCase();

  return (
    connector.id === "utila" ||
    connector.id === "walletConnect" ||
    connectorName.includes("utila") ||
    connectorName.includes("walletconnect")
  );
};

export const useUtilaConnectRetry = () => {
  const { address } = useActiveConnection();
  const { connectors: reconnectConnectors, mutate: reconnectWallet } =
    useReconnect();
  const [retryingConnect, setRetryingConnect] = useState(false);
  const connectRetryIntervalRef = useRef<number | null>(null);
  const connectRetryTimeoutRef = useRef<number | null>(null);
  const connectRetryKickoffRef = useRef<number | null>(null);

  const clearConnectRetry = useCallback(() => {
    if (connectRetryKickoffRef.current) {
      window.clearTimeout(connectRetryKickoffRef.current);
      connectRetryKickoffRef.current = null;
    }

    if (connectRetryIntervalRef.current) {
      window.clearInterval(connectRetryIntervalRef.current);
      connectRetryIntervalRef.current = null;
    }

    if (connectRetryTimeoutRef.current) {
      window.clearTimeout(connectRetryTimeoutRef.current);
      connectRetryTimeoutRef.current = null;
    }
  }, []);

  const startConnectRetry = useCallback(
    (openConnect: () => Promise<void>) => {
      clearConnectRetry();
      setRetryingConnect(true);

      void openConnect().catch(() => {});

      const tryReconnect = () => {
        const utilaConnectors = reconnectConnectors.filter(isUtilaConnector);

        reconnectWallet(
          utilaConnectors.length ? { connectors: utilaConnectors } : undefined,
          {
            onSuccess: (connections) => {
              if (!connections.length) {
                return;
              }

              clearConnectRetry();
              setRetryingConnect(false);
            },
          },
        );
      };

      connectRetryKickoffRef.current = window.setTimeout(tryReconnect, 250);
      connectRetryIntervalRef.current = window.setInterval(tryReconnect, 1_000);
      connectRetryTimeoutRef.current = window.setTimeout(() => {
        clearConnectRetry();
        setRetryingConnect(false);
      }, 60_000);
    },
    [clearConnectRetry, reconnectConnectors, reconnectWallet],
  );

  useEffect(() => {
    if (!address) {
      return;
    }

    clearConnectRetry();

    const timeout = window.setTimeout(() => {
      setRetryingConnect(false);
    });

    return () => window.clearTimeout(timeout);
  }, [address, clearConnectRetry]);

  useEffect(() => {
    return clearConnectRetry;
  }, [clearConnectRetry]);

  return { retryingConnect, startConnectRetry };
};
