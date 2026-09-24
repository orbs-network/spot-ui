import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { Partners } from "../src/config/partners";
import { getOrders as getCurrentOrders } from "../src/history/current/api";
import { buildV2Order } from "../src/history/current/normalize";
import {
getAccountOrders,
getAccountOrdersResult,
} from "../src/history/get-account-orders";
import { getOrders as getLegacyOrders } from "../src/history/legacy/api";
import { ADDRESS_4,createV2Order } from "./fixtures";

vi.mock("../src/history/legacy/api", () => ({ getOrders: vi.fn() }));
vi.mock("../src/history/current/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/history/current/api")>()),
  getOrders: vi.fn(),
}));

const params = {
  account: ADDRESS_4,
  chainId: 747474,
  partner: Partners.Katana,
};
const order = buildV2Order(createV2Order(747474, "available-order"));

describe("account history source failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLegacyOrders).mockResolvedValue([]);
    vi.mocked(getCurrentOrders).mockResolvedValue([order]);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("reports a failed legacy source and allows it to recover", async () => {
    vi.mocked(getLegacyOrders).mockRejectedValueOnce(
      new Error("temporary outage"),
    );
    const partial = await getAccountOrdersResult(params);
    expect(partial).toEqual({ orders: [order], legacyLoaded: false });
    const recovered = await getAccountOrdersResult(params);
    expect(recovered).toEqual({ orders: [order], legacyLoaded: true });
    expect(getLegacyOrders).toHaveBeenCalledTimes(2);
  });

  it("keeps current orders when the legacy subgraph is unavailable", async () => {
    vi.mocked(getLegacyOrders).mockRejectedValue(
      new Error("subgraph not found: no allocations"),
    );
    await expect(getAccountOrders(params)).resolves.toEqual([order]);
  });

  it("keeps legacy history when the current service is unavailable", async () => {
    vi.mocked(getLegacyOrders).mockResolvedValue([order]);
    vi.mocked(getCurrentOrders).mockRejectedValue(new Error("unavailable"));
    await expect(getAccountOrders(params)).resolves.toEqual([order]);
  });

  it("reports failure when both history sources fail", async () => {
    vi.mocked(getLegacyOrders).mockRejectedValue(
      new Error("subgraph unavailable"),
    );
    vi.mocked(getCurrentOrders).mockRejectedValue(
      new Error("service unavailable"),
    );
    await expect(getAccountOrders(params)).rejects.toThrow(
      "service unavailable",
    );
  });

  it("does not count disabled legacy history as a successful source", async () => {
    vi.mocked(getCurrentOrders).mockRejectedValue(
      new Error("service unavailable"),
    );
    await expect(
      getAccountOrders({ ...params, legacyOrders: false }),
    ).rejects.toThrow("service unavailable");
  });

  it("does not count unsupported legacy history as a successful source", async () => {
    vi.mocked(getCurrentOrders).mockRejectedValue(
      new Error("service unavailable"),
    );
    await expect(
      getAccountOrders({ ...params, chainId: 999999 }),
    ).rejects.toThrow("service unavailable");
  });

  it("does not return partial history after cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(getLegacyOrders).mockImplementation(async () => {
      controller.abort(new Error("cancelled"));
      return [];
    });
    await expect(
      getAccountOrders({ ...params, signal: controller.signal }),
    ).rejects.toThrow("cancelled");
  });
});
