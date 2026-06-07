import type { Connector } from "@wagmi/core";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useDisconnect } from "wagmi";
import { useActiveConnection } from "./use-active-connection";

const UTILA_SESSION_CHECK_INTERVAL = 2_000;

const isUtilaRoute = (pathname: string) =>
  pathname === "/" || pathname === "/history";

const isUtilaConnector = (connector: Connector) => {
  const connectorName = connector.name.toLowerCase();

  return (
    connector.id === "utila" ||
    connector.id === "walletConnect" ||
    connectorName.includes("utila") ||
    connectorName.includes("walletconnect")
  );
};

export const useUtilaDisconnectSync = () => {
  const pathname = usePathname();
  const isUtila = isUtilaRoute(pathname);
  const { address, connector, isConnected } = useActiveConnection();
  const { disconnectAsync } = useDisconnect();
  const isCheckingRef = useRef(false);

  const forceDisconnect = useCallback(
    async (currentConnector: Connector) => {
      try {
        await disconnectAsync({ connector: currentConnector });
      } catch {
        currentConnector.emitter.emit("disconnect");
      }
    },
    [disconnectAsync],
  );

  useEffect(() => {
    if (!isUtila || !isConnected || !address || !connector) {
      return;
    }

    if (!isUtilaConnector(connector)) {
      return;
    }

    let disposed = false;
    const normalizedAddress = address.toLowerCase();

    const checkSession = async () => {
      if (disposed || isCheckingRef.current) {
        return;
      }

      isCheckingRef.current = true;

      try {
        const [accounts, isAuthorized] = await Promise.all([
          connector.getAccounts().catch(() => []),
          connector.isAuthorized?.().catch(() => false) ?? true,
        ]);
        const hasActiveAccount = accounts.some(
          (account) => account.toLowerCase() === normalizedAddress,
        );

        if (!isAuthorized || !hasActiveAccount) {
          await forceDisconnect(connector);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    void checkSession();

    const interval = window.setInterval(
      checkSession,
      UTILA_SESSION_CHECK_INTERVAL,
    );
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkSession);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [address, connector, forceDisconnect, isConnected, isUtila]);
};
