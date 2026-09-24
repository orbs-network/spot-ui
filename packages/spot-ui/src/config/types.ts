import { type RePermitOrder } from "../contracts/types";
import { type Address } from "../shared/types";

export type RePermitData = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  order: RePermitOrder;
  partner?: string;
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
};
