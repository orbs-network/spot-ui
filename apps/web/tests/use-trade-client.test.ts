import { beforeEach, describe, expect, it, vi } from "vitest";
import { skipToken } from "@tanstack/react-query";
import { useTrade } from "../lib/hooks/use-trade";
import { TABS, type BestTradeQuote, type Currency } from "../lib/types";

type QuoteOptions = {
  queryKey: readonly unknown[];
  queryFn: ((context: { signal: AbortSignal }) => Promise<BestTradeQuote>) | symbol;
  enabled?: boolean;
};

const state = vi.hoisted(() => ({
  getQuote: vi.fn(),
  client: {
    data: undefined as { getQuote: ReturnType<typeof vi.fn> } | undefined,
    error: null as Error | null,
    isLoading: false,
    refetch: vi.fn(),
    chainId: 137,
    partner: "quick",
  },
  quote: {
    data: undefined as BestTradeQuote | undefined,
    error: null as Error | null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  options: undefined as QuoteOptions | undefined,
  pauseQuote: false,
  tab: "SWAP",
  account: "0x3333333333333333333333333333333333333333",
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (options: QuoteOptions) => {
    state.options = options;
    return state.quote;
  },
}));
vi.mock("../lib/hooks/use-spot-client", () => ({ useSpotClient: () => state.client }));
vi.mock("../lib/hooks/use-settings", () => ({ useSettings: () => ({ slippage: 0.5 }) }));
vi.mock("../lib/hooks/store", () => ({
  useSwapStore: Object.assign(
    () => ({ pauseQuote: state.pauseQuote }),
    { getState: () => ({ pauseQuote: state.pauseQuote }) },
  ),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: state.account }) }));
vi.mock("../lib/hooks/use-tabs", () => ({ useSelectedFormTab: () => ({ value: state.tab }) }));
vi.mock("../lib/hooks/use-usd-price", () => ({ useUSDPrice: () => ({ isLoading: false }) }));
vi.mock("../lib/utils", () => ({
  isNativeAddress: (address: string) => address === "native",
  getWrappedNativeCurrency: () => ({ address: "0x4444444444444444444444444444444444444444" }),
  toAmountUI: vi.fn(),
  toAmountRaw: vi.fn(),
}));

const input: Currency = {
  address: "0x1111111111111111111111111111111111111111",
  symbol: "IN", name: "Input", decimals: 6, logoUrl: "",
};
const output: Currency = {
  address: "0x2222222222222222222222222222222222222222",
  symbol: "OUT", name: "Output", decimals: 18, logoUrl: "",
};
const cachedQuote: BestTradeQuote = {
  inToken: input.address, outToken: output.address, inAmount: "1000",
  outAmount: "2000", minAmountOut: "1990", gas: "0", originalQuote: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.client.data = undefined;
  state.client.error = null;
  state.client.isLoading = false;
  state.client.chainId = 137;
  state.client.partner = "quick";
  state.client.refetch.mockResolvedValue({ data: undefined });
  state.quote.data = undefined;
  state.quote.error = null;
  state.quote.isLoading = false;
  state.quote.isError = false;
  state.options = undefined;
  state.pauseQuote = false;
  state.tab = TABS.SWAP;
});

describe("trade quotes using the shared client", () => {
  it("shows client initialization as loading without requesting a quote", () => {
    state.client.isLoading = true;
    const trade = useTrade(input, output, "1000");

    expect(trade.isLoading).toBe(true);
    expect(trade.data).toBeUndefined();
    expect(state.options?.queryFn).toBe(skipToken);
    expect(state.getQuote).not.toHaveBeenCalled();
  });

  it("uses the bound client for quote amounts, preview identity, and cancellation", async () => {
    state.client.data = { getQuote: state.getQuote };
    const originalQuote = { netAmountOut: "2000" };
    state.getQuote.mockResolvedValue(originalQuote);
    useTrade(input, output, "1000");
    const signal = new AbortController().signal;
    const queryFn = state.options?.queryFn;
    if (typeof queryFn !== "function") throw new Error("Expected an enabled quote request");
    const quote = await queryFn({ signal });

    expect(state.getQuote).toHaveBeenCalledWith({
      inToken: input.address, outToken: output.address, inAmount: "1000",
      user: state.account, slippage: 0.5, dexMinAmountOut: "-1", signal,
    });
    expect(quote).toEqual({ ...cachedQuote, originalQuote });
  });

  it("exposes initialization failures and retries initialization before quoting", async () => {
    state.client.error = new Error("Unsupported chain");
    const trade = useTrade(input, output, "1000");

    expect(trade.error).toBe(state.client.error);
    expect(trade.isLoading).toBe(false);
    expect(trade.data).toBeUndefined();
    await trade.refetch();
    expect(state.client.refetch).toHaveBeenCalledOnce();
    expect(state.quote.refetch).not.toHaveBeenCalled();
    expect(state.getQuote).not.toHaveBeenCalled();
  });

  it("retries the quote directly once a client is ready", async () => {
    state.client.data = { getQuote: state.getQuote };
    state.quote.error = new Error("No liquidity");
    state.quote.isError = true;
    const trade = useTrade(input, output, "1000");

    expect(trade.error).toBe(state.quote.error);
    await trade.refetch();
    expect(state.quote.refetch).toHaveBeenCalledOnce();
    expect(state.client.refetch).not.toHaveBeenCalled();
  });

  it("keeps a failed cached quote unavailable when quote refreshes are paused", () => {
    state.client.data = { getQuote: state.getQuote };
    state.quote.data = cachedQuote;
    state.quote.error = new Error("Quote refresh failed");
    state.quote.isError = true;
    state.pauseQuote = true;

    expect(useTrade(input, output, "1000").data).toBeUndefined();
  });

  it.each(["disabled", "advanced order", "paused", "empty input"])(
    "does not surface client initialization state for %s",
    (condition) => {
      state.client.isLoading = true;
      state.client.error = new Error("Initialization failed");
      if (condition === "advanced order") state.tab = TABS.TWAP;
      if (condition === "paused") state.pauseQuote = true;
      const trade = useTrade(input, output, condition === "empty input" ? "" : "1000", condition === "disabled");

      expect(trade.isLoading).toBe(false);
      expect(trade.error).toBeNull();
      expect(trade.data).toBeUndefined();
    },
  );

  it("does not display a previous scope's quote while the next client initializes", () => {
    state.client.data = { getQuote: state.getQuote };
    state.quote.data = cachedQuote;
    expect(useTrade(input, output, "1000").data).toBe(cachedQuote);
    const previousKey = state.options?.queryKey;

    state.client.chainId = 8453;
    state.client.partner = "other-partner";
    state.client.data = undefined;
    state.client.isLoading = true;
    const trade = useTrade(input, output, "1000");

    expect(state.options?.queryKey).not.toEqual(previousKey);
    expect(trade.data).toBeUndefined();
    expect(trade.isLoading).toBe(true);
    expect(state.options?.queryFn).toBe(skipToken);
  });
});
