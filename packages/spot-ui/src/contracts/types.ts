import { type Address, type Hex } from "../shared/types";

export interface RePermitOrder {
  permitted: {
    token: Address;
    amount: string;
  };
  spender: Address;
  nonce: string;
  deadline: string;
  witness: {
    reactor: Address;
    executor: Address;
    exchange: {
      adapter: Address;
      ref: Address;
      share: number;
      data: Hex;
    };
    swapper: Address;
    nonce: string;
    deadline: string;
    chainid: number;
    start?: string;
    exclusivity: number;
    epoch: number;
    slippage: number;
    freshness: number;
    input: {
      token: Address;
      amount: string;
      maxAmount: string;
    };
    output: {
      token: Address;
      limit: string;
      stop?: string;
      triggerLower?: string;
      triggerUpper?: string;
      recipient: Address;
    };
  };
}
