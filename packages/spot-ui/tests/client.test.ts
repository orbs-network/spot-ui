import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Module,
  calculateOrderForm,
  createClient,
  getPartners,
  type RePermitData,
} from "../src";
import {
  ADDRESS_1,
  ADDRESS_2,
  ADDRESS_3,
  createRePermitData,
} from "./fixtures";

const configuredPartner = getPartners()[0];
if (!configuredPartner) throw new Error("Expected at least one Spot partner");
const partner = configuredPartner.name;
const chainId = configuredPartner.chainId;

const createForm = () =>
  calculateOrderForm({
    module: Module.TWAP,
    inputTokenDecimals: 6,
    outputTokenDecimals: 18,
    quotedOutputAmountRaw: "2000000000000000000",
    inputTokenUsdPrice: "10",
    outputTokenUsdPrice: "5",
    minTradeSizeUsd: 1,
    priceProtectionPercent: 3,
    userInput: {
      inputAmountUi: "1",
      isMarketOrder: true,
      tradeCount: 2,
    },
  });

describe("createClient", () => {
  let responseData: RePermitData;

  beforeEach(() => {
    responseData = createRePermitData(chainId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => responseData,
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [
      "domain chain",
      (data: RePermitData) => {
        data.domain.chainId = chainId + 1;
      },
      "domain.chainId",
    ],
    [
      "order chain",
      (data: RePermitData) => {
        data.order.witness.chainid = chainId + 1;
      },
      "order.witness.chainid",
    ],
    [
      "RePermit address",
      (data: RePermitData) => {
        data.domain.verifyingContract =
          "0x0000000000000000000000000000000000000000";
      },
      "domain.verifyingContract",
    ],
    [
      "adapter address",
      (data: RePermitData) => {
        data.order.witness.exchange.adapter = "0x123";
      },
      "order.witness.exchange.adapter",
    ],
  ])("rejects an invalid %s", async (_label, mutate, expectedField) => {
    mutate(responseData);
    await expect(createClient(partner, chainId)).rejects.toThrow(expectedField);
  });

  it("creates strictly increasing nonces within one client", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const client = await createClient(partner, chainId);
    const form = createForm();

    const first = client.prepareOrder({
      form,
      inputTokenAddress: ADDRESS_2,
      outputTokenAddress: ADDRESS_3,
      swapperAddress: ADDRESS_1,
    });
    const second = client.prepareOrder({
      form,
      inputTokenAddress: ADDRESS_2,
      outputTokenAddress: ADDRESS_3,
      swapperAddress: ADDRESS_1,
    });

    expect(BigInt(second.order.nonce)).toBeGreaterThan(
      BigInt(first.order.nonce),
    );
  });

  it("requires callers to normalize native input to its wrapped token", async () => {
    const client = await createClient(partner, chainId);

    expect(() =>
      client.prepareOrder({
        form: createForm(),
        inputTokenAddress: "0x0000000000000000000000000000000000000000",
        outputTokenAddress: ADDRESS_3,
        swapperAddress: ADDRESS_1,
      }),
    ).toThrow("pass the host-provided wrapped native token");
  });
});
