import { describe, expect, it } from "vitest";
import { getTwapConfig, isTxRejected, Partners } from "../src";

describe("isTxRejected", () => {
  it.each([
    { code: 4001 },
    { code: "ACTION_REJECTED" },
    new Error("User rejected the request"),
    "Transaction denied by the user",
  ])("recognizes wallet rejection: $code$message", (error) => {
    expect(isTxRejected(error)).toBe(true);
  });

  it.each([
    new Error("order already cancelled"),
    new Error("canceled order cannot be found"),
    "submission rejected by the API",
  ])("does not hide an operational error: %s", (error) => {
    expect(isTxRejected(error)).toBe(false);
  });
});

describe("getTwapConfig", () => {
  it.each([
    [
      Partners.Pancake,
      56,
      {
        "name": "PancakeSwap",
        "twapAddress": "0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994",
        "exchangeAddress": "0x1A2bb6B75D58b740d88413ef4840D6fa3F637940"
      },
    ],
    [
      Partners.Pancake,
      42161,
      {
        "name": "PancakeSwap",
        "twapAddress": "0x0B94dcC0EA2d1ee33Ab064DaC252de980a941eF3",
        "exchangeAddress": "0xb37cB9A058c03081Ae6EF934313588cD53d408e7"
      },
    ],
    [
      Partners.Pancake,
      8453,
      {
        "name": "PancakeSwap",
        "twapAddress": "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
        "exchangeAddress": "0xb37cB9A058c03081Ae6EF934313588cD53d408e7"
      },
    ],
    [
      Partners.Pancake,
      59144,
      {
        "name": "PancakeSwap",
        "twapAddress": "0x48423e62acbfEF7779b5b4a5E7d6Fbd39E623d78",
        "exchangeAddress": "0xb37cB9A058c03081Ae6EF934313588cD53d408e7"
      },
    ],
    [
      Partners.Sushiswap,
      1,
      {
        "name": "SushiEth",
        "twapAddress": "0xb1ed8BCAD1EaC8a1DF0764700472391800D12946",
        "exchangeAddress": "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad"
      },
    ],
    [
      Partners.Sushiswap,
      42161,
      {
        "name": "SushiArb",
        "twapAddress": "0x0B94dcC0EA2d1ee33Ab064DaC252de980a941eF3",
        "exchangeAddress": "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad"
      },
    ],
    [
      Partners.Sushiswap,
      8453,
      {
        "name": "SushiBase",
        "twapAddress": "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
        "exchangeAddress": "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad"
      },
    ],
    [
      Partners.Sushiswap,
      747474,
      {
        "name": "SushiKatana",
        "twapAddress": "0xf2d96E7BE676153d202e1453804E2749923C7c5b",
        "exchangeAddress": "0x92209481507e6B2d14C9b5b70Ed287024177220E"
      },
    ],
    [
      Partners.Quick,
      137,
      {
        "name": "QuickSwap",
        "twapAddress": "0x688C027B0f7FaCeFcBa73e472900d28c12C5bDF4",
        "exchangeAddress": "0x8FCc245209bE85C49D738D0CE5613F74E5d91E86"
      },
    ],
    [
      Partners.Quick,
      8453,
      {
        "name": "QuickSwap",
        "twapAddress": "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
        "exchangeAddress": "0xb7a3d74895bfd3aff6780525e36d79fcf26a895f"
      },
    ],
    [
      Partners.Thena,
      56,
      {
        "name": "Thena",
        "twapAddress": "0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994",
        "exchangeAddress": "0x2B2fABDbfa4a15da0d351F947C14F4520db0bDc1"
      },
    ],
    [
      Partners.Spooky,
      250,
      {
        "name": "SpookySwap",
        "twapAddress": "0xd3B290FEB04E353d1821bc0a12397FdEa9a846C0",
        "exchangeAddress": "0xdF7CCd5fc7077E9de5f27a7b7bfDC837c82f8496"
      },
    ],
    [
      Partners.Spooky,
      146,
      {
        "name": "SpookySwapSonic",
        "twapAddress": "0x8963992816b4EafE5a22b7DB2A99513c18be9afA",
        "exchangeAddress": "0x6699bE3aF75e5c1B807b1031dBde6dA9A67739F3"
      },
    ],
    [
      Partners.Lynex,
      59144,
      {
        "name": "Lynex",
        "twapAddress": "0x48423e62acbfEF7779b5b4a5E7d6Fbd39E623d78",
        "exchangeAddress": "0x04C06C96d7D19977156016DD408B5992af0570a2"
      },
    ],
    [
      Partners.Swapx,
      146,
      {
        "name": "SwapX",
        "twapAddress": "0x8963992816b4EafE5a22b7DB2A99513c18be9afA",
        "exchangeAddress": "0xDA902994b7F7a1ecDd8De02E4a17dbFF2E6F67b7"
      },
    ],
    [
      Partners.Blackhole,
      43114,
      {
        "name": "BlackholeAvax",
        "twapAddress": "0xf77Ad005aBF7e31f669ce89a6568B2f39Ca92cDe",
        "exchangeAddress": "0xb7A3d74895bFD3Aff6780525e36D79FCf26a895F"
      },
    ],
    [
      Partners.Spark,
      14,
      {
        "name": "SparkDEX",
        "twapAddress": "0x9D70B0b90915Bb8b9bdAC7e6a7e6435bBF1feC4D",
        "exchangeAddress": "0xe59c53C76bB7EEc01401A18fA8215B94bC65Bf56"
      },
    ],
    [
      Partners.Katana,
      747474,
      {
        "name": "SushiKatana",
        "twapAddress": "0xf2d96E7BE676153d202e1453804E2749923C7c5b",
        "exchangeAddress": "0x92209481507e6B2d14C9b5b70Ed287024177220E"
      },
    ],
  ])(
    "returns the exact %s configuration on chain %i",
    (partner, chainId, config) => {
      expect(getTwapConfig(partner, chainId)).toMatchObject({ ...config, chainId });
    },
  );

  it.each([
    [Partners.Pancake, 1],
    [Partners.Quick, 1],
    [Partners.Spark, 56],
    [Partners.Katana, 1],
    [Partners.Agent, 1],
  ])("does not fall back for unsupported pair %s:%i", (partner, chainId) => {
    expect(getTwapConfig(partner, chainId)).toBeUndefined();
  });
});
