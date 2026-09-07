import { afterEach, describe, expect, it, vi } from "vitest";
import { Partners } from "../src";
import type { OrderV1 } from "../src/lib/types";
import { getOrders as getV1Orders } from "../src/lib/orders/v1-orders";
import { getOrders as getV2Orders } from "../src/lib/orders/v2-orders";
import { ADDRESS_4, createV2Order } from "./fixtures";

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
});

describe("v2 order history", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("converts public zero-based pages to one-based API pages", async () => {
    const requestedPages: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const page = Number(url.searchParams.get("page"));
        requestedPages.push(page);
        return jsonResponse({
          orders: [createV2Order(1, `order-${page}`)],
          totalPages: 2,
        });
      }),
    );

    const orders = await getV2Orders({ chainId: 1, account: ADDRESS_4 });

    expect(requestedPages.sort()).toEqual([1, 1, 2, 2]);
    expect(orders.map((order) => order.hash).sort()).toEqual([
      "order-1",
      "order-2",
    ]);
  });

  it("skips malformed items without hiding valid history", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          orders: [createV2Order(1, "valid-order"), {}],
          totalPages: 1,
        }),
      ),
    );

    const orders = await getV2Orders({ chainId: 1, account: ADDRESS_4 });

    expect(orders).toHaveLength(1);
    expect(orders[0]?.hash).toBe("valid-order");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("returns successful targets when another exchange target fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.searchParams.get("exchange") !== ADDRESS_4) {
          return jsonResponse({}, false);
        }
        return jsonResponse({
          orders: [createV2Order(56, "available-order")],
          totalPages: 1,
        });
      }),
    );

    const orders = await getV2Orders({
      chainId: 56,
      account: ADDRESS_4,
      exchange: ADDRESS_4,
      partner: Partners.Thena,
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]?.hash).toBe("available-order");
  });
});

describe("v1 order history", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("skips an unusable item before fetching related history", async () => {
    const validOrder = {
      Contract_id: "1",
      twapAddress: ADDRESS_4,
      exchange: ADDRESS_4,
      maker: ADDRESS_4,
      ask_srcAmount: "100",
      ask_srcBidAmount: "100",
      ask_dstMinAmount: "1",
      ask_srcToken: ADDRESS_4,
      ask_dstToken: ADDRESS_4,
      ask_fillDelay: 300,
      ask_deadline: 4_000_000_000,
      dollarValueIn: "1",
      timestamp: "2026-01-01T00:00:00.000Z",
      transactionHash: "0x1",
    } as OrderV1;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const query = JSON.parse(String(init?.body)).query as string;
        if (query.includes("orderCreateds")) {
          return jsonResponse({
            data: { orderCreateds: [validOrder, { Contract_id: null }] },
          });
        }
        if (query.includes("orderFilleds")) {
          return jsonResponse({ data: { orderFilleds: [] } });
        }
        return jsonResponse({ data: { statusNews: [] } });
      }),
    );

    const orders = await getV1Orders({ chainId: 1 });

    expect(orders).toHaveLength(1);
    expect(orders[0]?.id).toBe("1");
    expect(warn).toHaveBeenCalledOnce();
  });
});
