import type {
  ExecutionController,
  ExecutionStatus,
  SwapExecution,
} from "@orbs-network/spot-ui";
import type { StoreApi } from "zustand/vanilla";
import type { ClientResource } from "../client/resource";
import type { FormDefaults, FormState } from "../form/types";
import type { HistoryResource } from "../history/resource";

export interface State extends FormState {
  currentExecution: SwapExecution;
  cancelOrders: Record<
    string,
    {
      status: ExecutionStatus;
      txHash?: string;
      error?: string;
    }
  >;
}

export interface SpotStore extends ClientResource, HistoryResource {
  state: State;
  updateState: (value: Partial<State>) => void;
  beginExecution: ExecutionController["beginExecution"];
  replaceExecution: ExecutionController["replaceExecution"];
  returnToOrderForm: () => boolean;
  syncFormDefaults: (defaults: FormDefaults) => boolean;
  startNewOrder: (defaults: FormDefaults) => boolean;
  setCancelOrder: (
    historyKey: string,
    value: State["cancelOrders"][string],
  ) => void;
  clearCancelOrder: (historyKey: string) => void;
}

export type StoreSet = StoreApi<SpotStore>["setState"];
export type StoreGet = StoreApi<SpotStore>["getState"];
