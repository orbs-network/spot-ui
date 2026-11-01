import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/lib/analytics";
import type { SpotClient } from "../src/lib/client";
import { SpotError } from "../src/lib/errors";
import {
  executeOrder,
  type ExecuteOrderParams,
  type OrderExecutionUpdate,
  type OrderWalletInteractions,
  type SignableOrder,
} from "../src/lib/execute-order";
import { buildV2Order } from "../src/lib/orders/v2-orders";
import { OrderStatus, type Address, type OrderV2, type RePermitOrder } from "../src/lib/types";

const address = "0x0000000000000000000000000000000000000001";
const signature = "0x1234";
const now = 1_700_000_000_000;
const signingDuration = 180_000;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const makePreparedOrder = (deadlineMillis: number, account: Address = address): SignableOrder => {
  const deadline = String(deadlineMillis / 1000);
  const order: RePermitOrder = {
    permitted: { token: address, amount: "100" },
    spender: address,
    nonce: "1",
    deadline,
    witness: {
      reactor: address,
      executor: address,
      exchange: { adapter: address, ref: address, share: 0, data: "0x" },
      swapper: account,
      nonce: "1",
      deadline,
      chainid: 56,
      exclusivity: 0,
      epoch: 0,
      slippage: 0,
      freshness: 60,
      input: { token: address, amount: "100", maxAmount: "100" },
      output: { token: address, limit: "1", recipient: address },
    },
  };
  return {
    order,
    approvalRequest: { tokenAddress: address, spenderAddress: address, amount: "100" },
    signingRequest: {
      signerAddress: account,
      typedData: {
        domain: { name: "RePermit", version: "1", chainId: 56, verifyingContract: address },
        types: {},
        primaryType: "Order",
        message: order,
      },
    },
  };
};

const makeExecution = (deadlineMillis = now + signingDuration, account: Address = address) => {
  const preparedOrder = makePreparedOrder(deadlineMillis, account);
  const rawOrder: OrderV2 = {
    hash: "0xaccepted",
    signature,
    timestamp: new Date(now).toISOString(),
    order: preparedOrder.order,
    metadata: {
      status: "pending",
      description: "",
      expectedChunks: 1,
      chunks: [],
      lastPriceCheck: "",
      nextEligibleTime: "",
      displayOnlyInputTokenPriceUSD: "0",
      repermitDigest: "0x",
    },
  };
  const acceptedOrder = buildV2Order(rawOrder);
  const signing = deferred<`0x${string}`>();
  const signOrder = vi.fn<OrderWalletInteractions["signOrder"]>(() => signing.promise);
  const submitOrder = vi.fn<SpotClient["submitOrder"]>().mockResolvedValue(acceptedOrder);
  const analytics = new Analytics(true);
  const signingSuccess = vi.spyOn(analytics, "onSignOrderSuccess");
  const signingError = vi.spyOn(analytics, "onSignOrderError");
  const client: ExecuteOrderParams<SignableOrder>["client"] = {
    spenderAddress: address,
    submitOrder,
    analytics,
  };
  const walletInteractions: OrderWalletInteractions = {
    getAllowance: vi.fn().mockResolvedValue("100"),
    approveToken: vi.fn().mockResolvedValue("0xapproval"),
    wrapNativeToken: vi.fn().mockResolvedValue("0xwrap"),
    signOrder,
  };
  const prepareOrder = vi.fn(() => preparedOrder);
  const onUpdate = vi.fn<(update: OrderExecutionUpdate<SignableOrder>) => void>();
  const params: ExecuteOrderParams<SignableOrder> = {
    client,
    account,
    inputTokenAddress: address,
    inputAmountRaw: "100",
    walletInteractions,
    prepareOrder,
    onUpdate,
  };
  return {
    params, preparedOrder, acceptedOrder, signing, signOrder,
    submitOrder, prepareOrder, signingSuccess, signingError, onUpdate,
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("order signing deadline", () => {
  it.each(["resolve", "reject"] as const)("fails while the wallet is still open and ignores a later wallet %s", async (settlement) => {
    const execution = makeExecution();
    const pending = executeOrder(execution.params);
    const failed = expect(pending).rejects.toMatchObject({ name: "SpotError", code: "ORDER_EXPIRED" });
    await vi.advanceTimersByTimeAsync(0);
    expect(execution.signOrder).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(signingDuration);
    expect(execution.signingError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(execution.signingError).toHaveBeenCalledOnce();
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(execution.onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      phase: "signing", event: "error", error: expect.any(SpotError),
    }));
    expect(vi.getTimerCount()).toBe(0);

    const updatesAtExpiry = execution.onUpdate.mock.calls.length;
    if (settlement === "resolve") execution.signing.resolve(signature);
    else execution.signing.reject(new Error("Late wallet rejection"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(execution.signingSuccess).not.toHaveBeenCalled();
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(execution.onUpdate).toHaveBeenCalledTimes(updatesAtExpiry);
  });

  it("does not open the wallet for an already expired prepared order", async () => {
    const execution = makeExecution(now - 1000);
    await expect(executeOrder(execution.params)).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    expect(execution.signOrder).not.toHaveBeenCalled();
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not open the wallet if the deadline passes just after the initial check", async () => {
    const execution = makeExecution();
    vi.spyOn(Date, "now").mockReturnValue(now + signingDuration + 1).mockReturnValueOnce(now);
    await expect(executeOrder(execution.params)).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    expect(execution.signOrder).not.toHaveBeenCalled();
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["invalid", "Infinity", "-Infinity"])("rejects nonfinite deadline %s before opening the wallet", async (deadline) => {
    const execution = makeExecution();
    execution.preparedOrder.order.deadline = deadline;
    execution.preparedOrder.order.witness.deadline = deadline;
    await expect(executeOrder(execution.params)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(execution.signOrder).not.toHaveBeenCalled();
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("submits a signature returned before the deadline and clears its timer", async () => {
    const execution = makeExecution();
    const pending = executeOrder(execution.params);
    await vi.advanceTimersByTimeAsync(30_000);
    execution.signing.resolve(signature);
    await expect(pending).resolves.toMatchObject({ order: execution.acceptedOrder });
    expect(execution.submitOrder).toHaveBeenCalledWith(execution.preparedOrder.order, signature, { signal: undefined });
    expect(execution.signingSuccess).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(signingDuration);
    expect(execution.signingError).not.toHaveBeenCalled();
  });

  it("keeps wallet rejection errors and clears the deadline timer", async () => {
    const execution = makeExecution();
    const rejection = new Error("User rejected the request");
    const pending = executeOrder(execution.params);
    const failed = expect(pending).rejects.toBe(rejection);
    await vi.advanceTimersByTimeAsync(0);
    execution.signing.reject(rejection);
    await failed;
    expect(execution.signingError).toHaveBeenCalledWith(rejection);
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline timer when the wallet throws synchronously", async () => {
    const execution = makeExecution();
    const failure = new Error("Wallet unavailable");
    execution.signOrder.mockImplementationOnce(() => { throw failure; });
    await expect(executeOrder(execution.params)).rejects.toBe(failure);
    expect(execution.signingError).toHaveBeenCalledWith(failure);
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts a signature returned exactly at the deadline", async () => {
    const execution = makeExecution();
    const pending = executeOrder(execution.params);
    await vi.advanceTimersByTimeAsync(signingDuration);
    execution.signing.resolve(signature);
    await expect(pending).resolves.toMatchObject({ order: execution.acceptedOrder });
    expect(execution.signingError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a late signature after a clock jump even before the timer runs", async () => {
    const execution = makeExecution();
    const pending = executeOrder(execution.params);
    const failed = expect(pending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(now + signingDuration + 1);
    execution.signing.resolve(signature);
    await failed;
    expect(execution.signingSuccess).not.toHaveBeenCalled();
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports deadlines beyond the maximum native timer delay", async () => {
    const duration = 3_000_000_000;
    const execution = makeExecution(now + duration);
    const pending = executeOrder(execution.params);
    const failed = expect(pending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(execution.signOrder).toHaveBeenCalledOnce();
    expect(execution.signingError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(duration - 2_147_483_647 + 1);
    await failed;
    expect(execution.submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the execution lock so a retry can prepare a fresh order", async () => {
    const execution = makeExecution();
    const pending = executeOrder(execution.params);
    const failed = expect(pending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    await vi.advanceTimersByTimeAsync(signingDuration + 1);
    await failed;

    const fresh = makePreparedOrder(now + signingDuration * 2);
    execution.prepareOrder.mockReturnValue(fresh);
    execution.signOrder.mockResolvedValueOnce(signature);
    await expect(executeOrder(execution.params)).resolves.toMatchObject({ preparedOrder: fresh });
    expect(execution.submitOrder).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("concurrent order signing", () => {
  it.each(["different accounts on one client", "one account on different clients"] as const)(
    "keeps deadlines independent for %s",
    async (scenario) => {
      const first = makeExecution();
      const secondAccount = scenario === "different accounts on one client"
        ? "0x0000000000000000000000000000000000000002"
        : address;
      const second = makeExecution(now + signingDuration * 2, secondAccount);
      if (scenario === "different accounts on one client") {
        second.params.client = first.params.client;
        first.submitOrder.mockResolvedValue(second.acceptedOrder);
      }

      const firstPending = executeOrder(first.params);
      const firstFailed = expect(firstPending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
      const secondPending = executeOrder(second.params);
      await vi.advanceTimersByTimeAsync(0);
      expect(first.signOrder).toHaveBeenCalledOnce();
      expect(second.signOrder).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(2);

      await vi.advanceTimersByTimeAsync(signingDuration + 1);
      await firstFailed;
      expect(second.onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ event: "error" }));
      expect(vi.getTimerCount()).toBe(1);

      second.signing.resolve(signature);
      await expect(secondPending).resolves.toMatchObject({ order: second.acceptedOrder });
      const submittingClient = scenario === "different accounts on one client" ? first : second;
      expect(submittingClient.submitOrder).toHaveBeenCalledExactlyOnceWith(
        second.preparedOrder.order, signature, { signal: undefined },
      );
      expect(second.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ phase: "submitting", event: "request" }));
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["resolve", "reject"] as const)(
    "ignores an expired wallet's late %s while its retry is still signing",
    async (settlement) => {
      const execution = makeExecution();
      const firstPending = executeOrder(execution.params);
      const firstFailed = expect(firstPending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
      await vi.advanceTimersByTimeAsync(signingDuration + 1);
      await firstFailed;

      const fresh = makePreparedOrder(now + signingDuration * 2);
      const retrySigning = deferred<`0x${string}`>();
      execution.prepareOrder.mockReturnValue(fresh);
      execution.signOrder.mockReturnValueOnce(retrySigning.promise);
      const retryPending = executeOrder(execution.params);
      await vi.advanceTimersByTimeAsync(0);
      expect(execution.signOrder).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(1);
      const updatesBeforeStaleWallet = execution.onUpdate.mock.calls.length;

      if (settlement === "resolve") execution.signing.resolve("0xstale");
      else execution.signing.reject(new Error("Expired request was rejected"));
      await vi.advanceTimersByTimeAsync(0);
      expect(execution.onUpdate).toHaveBeenCalledTimes(updatesBeforeStaleWallet);
      expect(execution.signingSuccess).not.toHaveBeenCalled();
      expect(execution.signingError).toHaveBeenCalledOnce();
      expect(execution.submitOrder).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);
      await expect(executeOrder(execution.params)).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });

      retrySigning.resolve(signature);
      await expect(retryPending).resolves.toMatchObject({ preparedOrder: fresh });
      expect(execution.submitOrder).toHaveBeenCalledExactlyOnceWith(fresh.order, signature, { signal: undefined });
      expect(execution.signingSuccess).toHaveBeenCalledExactlyOnceWith(signature);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects simultaneous signing for the same account and client without disturbing the first", async () => {
    const execution = makeExecution();
    const pending = executeOrder(execution.params);
    await vi.advanceTimersByTimeAsync(0);
    const updatesBeforeDuplicate = execution.onUpdate.mock.calls.length;

    await expect(executeOrder(execution.params)).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });
    expect(execution.onUpdate).toHaveBeenCalledTimes(updatesBeforeDuplicate);
    expect(execution.signOrder).toHaveBeenCalledOnce();
    expect(execution.signingError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    execution.signing.resolve(signature);
    await expect(pending).resolves.toMatchObject({ order: execution.acceptedOrder });
    expect(execution.submitOrder).toHaveBeenCalledExactlyOnceWith(execution.preparedOrder.order, signature, { signal: undefined });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps submission locked until acceptance, then allows another order while the first is still open", async () => {
    const execution = makeExecution();
    const acceptance = deferred<typeof execution.acceptedOrder>();
    execution.submitOrder.mockReturnValueOnce(acceptance.promise);
    const pending = executeOrder(execution.params);
    await vi.advanceTimersByTimeAsync(0);
    execution.signing.resolve(signature);
    await vi.advanceTimersByTimeAsync(0);
    expect(execution.submitOrder).toHaveBeenCalledOnce();
    const updatesBeforeDuplicate = execution.onUpdate.mock.calls.length;

    await expect(executeOrder(execution.params)).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });
    expect(execution.onUpdate).toHaveBeenCalledTimes(updatesBeforeDuplicate);
    expect(execution.signOrder).toHaveBeenCalledOnce();
    expect(execution.submitOrder).toHaveBeenCalledOnce();

    acceptance.resolve(execution.acceptedOrder);
    await expect(pending).resolves.toMatchObject({ order: execution.acceptedOrder });
    expect(execution.acceptedOrder.status).toBe(OrderStatus.Open);
    const fresh = makePreparedOrder(now + signingDuration);
    fresh.order.nonce = "2";
    fresh.order.witness.nonce = "2";
    execution.prepareOrder.mockReturnValue(fresh);
    execution.signOrder.mockResolvedValueOnce("0xsecond");
    const secondAcceptedOrder = {
      ...execution.acceptedOrder,
      id: "0xsecond",
      historyKey: "second-order",
      rawOrder: { ...execution.acceptedOrder.rawOrder, order: fresh.order },
    };
    execution.submitOrder.mockResolvedValueOnce(secondAcceptedOrder);

    await expect(executeOrder(execution.params)).resolves.toMatchObject({
      order: secondAcceptedOrder, preparedOrder: fresh,
    });
    expect(execution.submitOrder).toHaveBeenLastCalledWith(fresh.order, "0xsecond", { signal: undefined });
    expect(execution.submitOrder).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
