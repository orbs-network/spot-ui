import Configs from "@orbs-network/twap/configs.json";
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
    [Partners.Pancake, 56, Configs.PancakeSwap],
    [Partners.Pancake, 42161, Configs.PancakeSwapArbitrum],
    [Partners.Pancake, 8453, Configs.PancakeSwapBase],
    [Partners.Pancake, 59144, Configs.PancakeSwapLinea],
    [Partners.Sushiswap, 1, Configs.SushiEth],
    [Partners.Sushiswap, 42161, Configs.SushiArb],
    [Partners.Sushiswap, 8453, Configs.SushiBase],
    [Partners.Sushiswap, 747474, Configs.SushiKatana],
    [Partners.Quick, 137, Configs.QuickSwap],
    [Partners.Quick, 8453, Configs.QuickSwapBase],
    [Partners.Thena, 56, Configs.Thena],
    [Partners.Spooky, 250, Configs.SpookySwap],
    [Partners.Spooky, 146, Configs.SpookySwapSonic],
    [Partners.Lynex, 59144, Configs.Lynex],
    [Partners.Swapx, 146, Configs.SwapX],
    [Partners.Blackhole, 43114, Configs.BlackholeAvax],
    [Partners.Spark, 14, Configs.SparkDEX],
    [Partners.Katana, 747474, Configs.SushiKatana],
  ])(
    "returns the exact %s configuration on chain %i",
    (partner, chainId, config) => {
      expect(getTwapConfig(partner, chainId)).toEqual(config);
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
