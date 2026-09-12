import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountOrders } from "../src/lib/orders";
import { getOrders as getLegacyOrders } from "../src/lib/orders/v1-orders";
import { buildV2Order, getOrders as getCurrentOrders } from "../src/lib/orders/v2-orders";
import { Partners } from "../src/lib/types";
import { ADDRESS_4, createV2Order } from "./fixtures";

vi.mock("../src/lib/orders/v1-orders", () => ({ getOrders: vi.fn() }));
vi.mock("../src/lib/orders/v2-orders", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/orders/v2-orders")>(),
  getOrders: vi.fn(),
}));

const params = { account: ADDRESS_4, chainId: 747474, partner: Partners.Katana };
const order = buildV2Order(createV2Order(747474, "available-order"));

describe("account history source failures", () => {
  beforeEach(() => {
    vi.mocked(getLegacyOrders).mockResolvedValue([]);
    vi.mocked(getCurrentOrders).mockResolvedValue([order]);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps current orders when the legacy subgraph is unavailable", async () => {
    vi.mocked(getLegacyOrders).mockRejectedValue(new Error("subgraph not found: no allocations"));
    await expect(getAccountOrders(params)).resolves.toEqual([order]);
  });

  it("keeps legacy history when the current service is unavailable", async () => {
    vi.mocked(getLegacyOrders).mockResolvedValue([order]);
    vi.mocked(getCurrentOrders).mockRejectedValue(new Error("unavailable"));
    await expect(getAccountOrders(params)).resolves.toEqual([order]);
  });

  it("reports failure when both history sources fail", async () => {
    vi.mocked(getLegacyOrders).mockRejectedValue(new Error("subgraph unavailable"));
    vi.mocked(getCurrentOrders).mockRejectedValue(new Error("service unavailable"));
    await expect(getAccountOrders(params)).rejects.toThrow("service unavailable");
  });

  it("does not count disabled legacy history as a successful source", async () => {
    vi.mocked(getCurrentOrders).mockRejectedValue(new Error("service unavailable"));
    await expect(getAccountOrders({ ...params, legacyOrders: false })).rejects.toThrow("service unavailable");
  });

  it("does not count unsupported legacy history as a successful source", async () => {
    vi.mocked(getCurrentOrders).mockRejectedValue(new Error("service unavailable"));
    await expect(getAccountOrders({ ...params, chainId: 999999 })).rejects.toThrow("service unavailable");
  });

  it("does not return partial history after cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(getLegacyOrders).mockImplementation(async () => {
      controller.abort(new Error("cancelled"));
      return [];
    });
    await expect(getAccountOrders({ ...params, signal: controller.signal })).rejects.toThrow("cancelled");
  });
});
