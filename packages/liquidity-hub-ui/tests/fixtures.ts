import type { Quote } from "../src/lib";

export const createQuote = (overrides: Partial<Quote> = {}): Quote => ({
  inToken: "0x0000000000000000000000000000000000000001",
  outToken: "0x0000000000000000000000000000000000000002",
  inAmount: "100",
  outAmount: "220",
  user: "0x0000000000000000000000000000000000000003",
  slippage: 0.5,
  qs: "",
  partner: "test-partner",
  exchange: "test-exchange",
  sessionId: "session-1",
  serializedOrder: "serialized-order",
  permitData: {
    domain: { name: "Permit2", chainId: 137 },
    types: {
      Permit: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
    values: { token: "0x1", amount: "100" },
    primaryType: "Permit",
  },
  eip712: {
    domain: { name: "Permit2", chainId: 137 },
    types: {
      Permit: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { token: "0x1", amount: "100" },
  },
  minAmountOut: "200",
  gasAmountOut: "1",
  referencePrice: "2.2",
  userMinOutAmountWithGas: "200",
  outAmountWsMinusGas: "219",
  outAmountWS: "210",
  timestamp: Date.now(),
  ...overrides,
});

export const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
