import { useMemo } from "react";
import { useConnection, useConnections } from "wagmi";

export const useActiveConnection = () => {
  const connection = useConnection();
  const connections = useConnections();
  const fallbackConnection = connections[0];
  const fallbackAddress = fallbackConnection?.accounts[0];
  

  return useMemo(
    () => ({
      ...connection,
      address: connection.address ?? fallbackAddress,
      addresses: connection.addresses ?? fallbackConnection?.accounts,
      chainId: connection.chainId ?? fallbackConnection?.chainId,
      connector: connection.connector ?? fallbackConnection?.connector,
      isConnected: connection.isConnected || Boolean(fallbackAddress),
    }),
    [connection, fallbackAddress, fallbackConnection],
  );
};
