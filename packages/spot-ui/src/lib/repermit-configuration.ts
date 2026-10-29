import { SpotError } from "./errors";
import type { Address, RePermitData, RePermitOrder } from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/i;

function assertConfiguredAddress(value: unknown, field: string): asserts value is Address {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value) || ZERO_ADDRESS_PATTERN.test(value)) {
    throw new SpotError("INVALID_CONFIGURATION",
      `Invalid RePermit configuration: ${field} must be a non-zero EVM address`,
    );
  }
}

/** Validate the requested chain and required contracts before a template is reused. */
export const assertRePermitConfiguration = (data: RePermitData, requestedChainId: number): void => {
  if (!data || typeof data !== "object") {
    throw new SpotError("INVALID_CONFIGURATION", "Invalid RePermit configuration: expected an object");
  }
  const config = data as Partial<RePermitData>;
  const domain = config.domain as Partial<RePermitData["domain"]> | undefined;
  const order = config.order as Partial<RePermitOrder> | undefined;
  const witness = order?.witness as Partial<RePermitOrder["witness"]> | undefined;

  if (Number(domain?.chainId) !== requestedChainId) {
    throw new SpotError("INVALID_CONFIGURATION",
      `Invalid RePermit configuration: domain.chainId does not match requested chain ${requestedChainId}`,
    );
  }
  if (Number(witness?.chainid) !== requestedChainId) {
    throw new SpotError("INVALID_CONFIGURATION",
      `Invalid RePermit configuration: order.witness.chainid does not match requested chain ${requestedChainId}`,
    );
  }
  assertConfiguredAddress(domain?.verifyingContract, "domain.verifyingContract");
  assertConfiguredAddress(witness?.exchange?.adapter, "order.witness.exchange.adapter");
};
