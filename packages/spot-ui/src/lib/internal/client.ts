import type {
  CreateClientOptions, ExecuteOrderParams, ExecutedOrder, PrepareSwapParams,
  PreparedOrder, ResumeOrderParams, SpotClient,
} from "../client";
import type { SpotAnalytics } from "../analytics";
import type { SwapQuote } from "../quote";
import type { Order } from "../types";
import type { PreparedSwap } from "../swap";
import type { OrderExecutionUpdate } from "./execute-order";
import { SpotError } from "../errors";

/** React-only execution inputs; applications call the public client methods. */
export interface InternalExecuteOrderParams extends ExecuteOrderParams {
  quote?: SwapQuote;
  completedWrapTxHash?: string;
  validateContext?: () => void;
  onUpdate?: (update: OrderExecutionUpdate<PreparedOrder>) => void;
  analytics?: SpotAnalytics;
  wait?: (milliseconds: number) => Promise<void>;
}

export interface InternalResumeOrderControls {
  onUpdate?: (order: Order) => void;
  analytics?: SpotAnalytics;
}

interface ClientInternals {
  analytics: SpotAnalytics;
  executeOrder: (params: InternalExecuteOrderParams) => Promise<ExecutedOrder>;
  prepareSwap: (params: PrepareSwapParams, analytics?: SpotAnalytics) => Promise<PreparedSwap>;
  resumeOrder: (params: ResumeOrderParams, controls?: InternalResumeOrderControls) => Promise<Order>;
}

const clients = new WeakMap<SpotClient, ClientInternals>();
const creationAnalytics = new WeakMap<CreateClientOptions, SpotAnalytics>();

export function registerClientInternals(client: SpotClient, internal: ClientInternals): void {
  clients.set(client, internal);
}

const getInternals = (client: SpotClient): ClientInternals => {
  const internal = clients.get(client);
  if (!internal) throw new SpotError("INVALID_ARGUMENT", "Use a client initialized by createClient");
  return internal;
};

export function getClientAnalytics(client: SpotClient): SpotAnalytics {
  return getInternals(client).analytics;
}

export async function executeClientOrder(client: SpotClient, params: InternalExecuteOrderParams): Promise<ExecutedOrder> {
  return getInternals(client).executeOrder(params);
}

export async function prepareClientSwap(client: SpotClient, params: PrepareSwapParams, analytics?: SpotAnalytics): Promise<PreparedSwap> {
  return getInternals(client).prepareSwap(params, analytics);
}

export async function resumeClientOrder(client: SpotClient, params: ResumeOrderParams, controls?: InternalResumeOrderControls): Promise<Order> {
  return getInternals(client).resumeOrder(params, controls);
}

/** Attach React's shared telemetry policy without adding an option to createClient. */
export function bindClientCreationAnalytics(options: CreateClientOptions, analytics: SpotAnalytics): void {
  creationAnalytics.set(options, analytics);
}

export function getClientCreationAnalytics(options: CreateClientOptions): SpotAnalytics | undefined {
  return creationAnalytics.get(options);
}
