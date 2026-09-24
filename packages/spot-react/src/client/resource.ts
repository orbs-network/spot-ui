import type { SpotClient } from "@orbs-network/spot-ui";
import type { StoreSet } from "../store/types";
export interface ClientResourceState {
  key?: string;
  data?: SpotClient;
  error?: Error;
  isFetching: boolean;
}
export type ClientLoader = () => Promise<SpotClient>;
const EMPTY_CLIENT_STATE: ClientResourceState = { isFetching: false };
const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const createClientResource = (set: StoreSet): ClientResource => {
  let clientKey: string | undefined;
  let clientLoader: ClientLoader | undefined;
  let clientRequestId = 0;
  let clientPromise: Promise<SpotClient | undefined> | undefined;
  const refetchClient = async (): Promise<SpotClient | undefined> => {
    if (!clientKey || !clientLoader) return undefined;
    if (clientPromise) return clientPromise;

    const requestId = ++clientRequestId;
    const load = clientLoader;
    set((store) => ({
      client: {
        key: clientKey,
        data: store.client.data,
        error: undefined,
        isFetching: true,
      },
    }));

    const promise = (async () => {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (requestId !== clientRequestId) return undefined;
        try {
          const client = await load();
          if (requestId !== clientRequestId) return undefined;
          set({
            client: { key: clientKey, data: client, isFetching: false },
          });
          return client;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (requestId !== clientRequestId) return undefined;
          if (attempt < 2) await wait(2 ** attempt * 1_000);
        }
      }

      if (requestId === clientRequestId) {
        set({
          client: { key: clientKey, error: lastError, isFetching: false },
        });
      }
      return undefined;
    })();

    clientPromise = promise;
    void promise.finally(() => {
      if (clientPromise === promise) clientPromise = undefined;
    });
    return promise;
  };
  return {
    client: EMPTY_CLIENT_STATE,
    configureClient: (key, loader) => {
      if (clientKey === key) {
        clientLoader = loader;
        return;
      }
      clientKey = key;
      clientLoader = loader;
      clientRequestId++;
      clientPromise = undefined;
      set({
        client: key ? { key, isFetching: false } : EMPTY_CLIENT_STATE,
      });
      if (key && loader) void refetchClient();
    },
    refetchClient,
  };
};

export interface ClientResource {
  client: ClientResourceState;
  configureClient: (key?: string, loader?: ClientLoader) => void;
  refetchClient: () => Promise<SpotClient | undefined>;
}
