import type { CreateClientOptions, SpotClient } from "../client";
import type { SpotAnalytics } from "../analytics";
import { SpotError } from "../errors";

interface ClientInternals { analytics: SpotAnalytics }

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

/** Attach React's shared telemetry policy without adding an option to createClient. */
export function bindClientCreationAnalytics(options: CreateClientOptions, analytics: SpotAnalytics): void {
  creationAnalytics.set(options, analytics);
}

export function getClientCreationAnalytics(options: CreateClientOptions): SpotAnalytics | undefined {
  return creationAnalytics.get(options);
}
