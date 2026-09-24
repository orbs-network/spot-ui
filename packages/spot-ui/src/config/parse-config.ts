import type { RePermitOrder } from "../contracts/types";
import type { Address } from "../shared/types";
import type { RePermitData } from "./types";

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/i;

function assertConfiguredAddress(
  value: unknown,
  field: string,
): asserts value is Address {
  if (
    typeof value !== "string" ||
    !ADDRESS_PATTERN.test(value) ||
    ZERO_ADDRESS_PATTERN.test(value)
  ) {
    throw new Error(
      `Invalid RePermit configuration: ${field} must be a non-zero EVM address`,
    );
  }
}

export const parseRePermitConfiguration = (
  data: unknown,
  requestedChainId: number,
): RePermitData => {
  if (!data || typeof data !== "object")
    throw new Error("Invalid RePermit configuration: expected an object");
  const config = data as Partial<RePermitData>;
  const domain = config.domain as Partial<RePermitData["domain"]> | undefined;
  const order = config.order as Partial<RePermitOrder> | undefined;
  const witness = order?.witness as
    Partial<RePermitOrder["witness"]> | undefined;

  if (Number(domain?.chainId) !== requestedChainId) {
    throw new Error(
      `Invalid RePermit configuration: domain.chainId does not match requested chain ${requestedChainId}`,
    );
  }
  if (Number(witness?.chainid) !== requestedChainId) {
    throw new Error(
      `Invalid RePermit configuration: order.witness.chainid does not match requested chain ${requestedChainId}`,
    );
  }

  assertConfiguredAddress(
    domain?.verifyingContract,
    "domain.verifyingContract",
  );
  assertConfiguredAddress(
    witness?.exchange?.adapter,
    "order.witness.exchange.adapter",
  );
  return data as RePermitData;
};
