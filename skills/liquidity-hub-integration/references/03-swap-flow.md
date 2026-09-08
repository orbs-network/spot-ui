# Complete Swap Flow

## Overview

The full Liquidity Hub swap flow has these stages:

1. **Quote** — Fetch LH quote alongside DEX quote
2. **Compare** — Pick the better price
3. **Wrap** — If source token is native (ETH/BNB/etc.), wrap to WETH/WBNB
4. **Approve** — Approve Permit2 contract for the source token
5. **Sign** — User signs the EIP-712 typed data from the quote
6. **Swap** — Submit the signed quote to Liquidity Hub
7. **Confirm** — Use the DEX's receipt client and reject reverted receipts

## Step-by-Step

### 1. Fetch Quote

Fetch the LH quote alongside your existing DEX quote. Pass the DEX output as `dexMinAmountOut` so the protocol can optimize:

```ts
const lhQuote = await lh.getQuote({
  fromToken,
  toToken,
  inAmount: amount,
  dexMinAmountOut: dexQuote.minOutput, // from your existing DEX router quote
  account: userAddress,
  slippage: 0.5,
});
```

### 2. Compare Prices

```ts
const useLiquidityHub =
  lhQuote && BigInt(lhQuote.minAmountOut) > BigInt(dexMinAmountOut);
```

### 3. Wrap Native Token (if needed)

Liquidity Hub only works with ERC-20 tokens. If the user is swapping a native token, wrap it first:

```ts
import { isNativeAddress } from "@orbs-network/liquidity-hub-sdk";

const isNative = isNativeAddress(fromToken);

if (isNative) {
  lh.analytics.wrap.onRequest();
  try {
    const wrapTx = await walletClient.writeContract({
      abi: IWETH_ABI,
      functionName: "deposit",
      address: wrappedTokenAddress,
      value: BigInt(amount),
    });
    const wrapReceipt = await publicClient.waitForTransactionReceipt({
      hash: wrapTx,
    });
    if (wrapReceipt.status !== "success") {
      throw new Error("Wrap transaction reverted");
    }
    lh.analytics.wrap.onSuccess(wrapTx);
  } catch (error) {
    lh.analytics.wrap.onFailed(
      error instanceof Error ? error.message : "Wrap failed",
    );
    throw error;
  }
}
```

### 4. Approve Permit2

The user needs to approve the Permit2 contract (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) to spend the source token. This is a one-time approval per token:

```ts
import { maxUint256, permit2Address } from "@orbs-network/liquidity-hub-sdk";

const allowance = await readContract({
  address: tokenAddress,
  abi: erc20Abi,
  functionName: "allowance",
  args: [userAddress, permit2Address],
});

if (BigInt(allowance) < BigInt(amount)) {
  lh.analytics.approval.onRequest();
  try {
    const approveTx = await walletClient.writeContract({
      abi: erc20Abi,
      functionName: "approve",
      address: tokenAddress,
      args: [permit2Address, maxUint256],
    });
    const approvalReceipt = await publicClient.waitForTransactionReceipt({
      hash: approveTx,
    });
    if (approvalReceipt.status !== "success") {
      throw new Error("Approval transaction reverted");
    }
    lh.analytics.approval.onSuccess(approveTx);
  } catch (error) {
    lh.analytics.approval.onFailed(
      error instanceof Error ? error.message : "Approval failed",
    );
    throw error;
  }
}
```

### 5. Sign the Quote

The quote contains EIP-712 typed data (`permitData`). The user must sign it:

```ts
lh.analytics.signature.onRequest();
try {
  const signature = await walletClient.signTypedData({
    domain: quote.permitData.domain,
    types: quote.permitData.types,
    primaryType: quote.permitData.primaryType,
    message: quote.permitData.values,
    account: userAddress,
  });
  lh.analytics.signature.onSuccess(signature);
} catch (error) {
  lh.analytics.signature.onFailed(
    error instanceof Error ? error.message : "Signature failed",
  );
  throw error;
}
```

### 6. Execute the Swap

```ts
const txHash = await lh.swap(quote, signature, {
  data: dexRouterCalldata, // Optional: DEX router calldata for fallback
  to: dexRouterAddress, // Optional: DEX router address
});
```

The SDK reports swap requests and failures itself. Do not call
`swap.onFailed` again when `swap()` rejects, or the failure event will be
duplicated.

### 7. Wait for Confirmation

```ts
try {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });
  if (receipt.status !== "success") {
    throw new Error("Liquidity Hub transaction reverted");
  }
  lh.analytics.swap.onSuccess();
  // Show success using the host DEX's receipt data.
} catch (error) {
  lh.analytics.swap.onFailed(
    error instanceof Error ? error.message : "Transaction confirmation failed",
  );
  throw error;
}
```

Once `txHash` exists, never start the DEX fallback because receipt polling or
an RPC request failed. Re-query that hash through the host's normal recovery
flow instead.

## Analytics Callbacks

Report analytics at every stage so the protocol can optimize for your DEX. The SDK exposes callbacks via `lh.analytics`:

| Stage        | Callbacks                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------- |
| Swap         | `swap.onSuccess()`, `swap.onFailed(errorMsg)`                                             |
| DEX fallback | `dexSwap({ panel, router, srcTokenAddress, dstTokenAddress, inAmount, txHash })`          |
| Wrap         | `wrap.onRequest()`, `wrap.onSuccess(txHash)`, `wrap.onFailed(errorMsg)`                   |
| Approval     | `approval.onRequest()`, `approval.onSuccess(txHash)`, `approval.onFailed(errorMsg)`       |
| Signature    | `signature.onRequest()`, `signature.onSuccess(signature)`, `signature.onFailed(errorMsg)` |

**Always report `dexSwap` when falling back to the DEX router.** This lets the protocol learn from missed opportunities and improve future quotes.
