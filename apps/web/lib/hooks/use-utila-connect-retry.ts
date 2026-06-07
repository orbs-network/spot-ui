import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
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
  const { connectModalOpen } = useConnectModal();
  const { connectors: reconnectConnectors, mutate: reconnectWallet } =
    useReconnect();
  const [retryingConnect, setRetryingConnect] = useState(false);
  const connectRetryIntervalRef = useRef<number | null>(null);
  const connectRetryTimeoutRef = useRef<number | null>(null);
  const connectRetryKickoffRef = useRef<number | null>(null);
  const connectClickInFlightRef = useRef(false);
  const hasObservedConnectModalOpenRef = useRef(false);

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
      hasObservedConnectModalOpenRef.current = false;
      setRetryingConnect(true);

      const clickConnect = () => {
        if (connectClickInFlightRef.current) {
          return;
        }

        connectClickInFlightRef.current = true;
        void openConnect()
          .catch(() => {})
          .finally(() => {
            connectClickInFlightRef.current = false;
          });
      };

      clickConnect();

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
              hasObservedConnectModalOpenRef.current = false;
              setRetryingConnect(false);
            },
          },
        );
      };

      connectRetryKickoffRef.current = window.setTimeout(tryReconnect, 250);
      connectRetryIntervalRef.current = window.setInterval(() => {
        clickConnect();
        tryReconnect();
      }, 1_000);
      connectRetryTimeoutRef.current = window.setTimeout(() => {
        clearConnectRetry();
        hasObservedConnectModalOpenRef.current = false;
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
    hasObservedConnectModalOpenRef.current = false;

    const timeout = window.setTimeout(() => {
      setRetryingConnect(false);
    });

    return () => window.clearTimeout(timeout);
  }, [address, clearConnectRetry]);

  useEffect(() => {
    if (connectModalOpen) {
      hasObservedConnectModalOpenRef.current = true;
      return;
    }

    if (!retryingConnect || !hasObservedConnectModalOpenRef.current) {
      return;
    }

    clearConnectRetry();
    hasObservedConnectModalOpenRef.current = false;

    const timeout = window.setTimeout(() => {
      setRetryingConnect(false);
    });

    return () => window.clearTimeout(timeout);
  }, [clearConnectRetry, connectModalOpen, retryingConnect]);

  useEffect(() => {
    return clearConnectRetry;
  }, [clearConnectRetry]);

  return { retryingConnect, startConnectRetry };
};
