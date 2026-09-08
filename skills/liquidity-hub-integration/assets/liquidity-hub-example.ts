/**
 * Liquidity Hub Integration Example
 *
 * This is a simplified example showing the full swap flow.
 * Adapt to your DEX's framework (React hooks, Vue composables, etc.)
 */

import {
  createClient,
  isFreshQuote,
  isLiquidityHubBetter,
  isNativeAddress,
  maxUint256,
  permit2Address,
  type Quote,
  type LiquidityHubClient,
} from "@orbs-network/liquidity-hub-sdk";

// ============ Initialize SDK ============

// Create one instance per chain — re-create when chain changes
const lh: LiquidityHubClient = createClient({
  chainId: 137, // DEX: Replace with active chain ID
  partner: "mydex", // DEX: Replace with your registered partner name
});

interface WalletClient {
  readContract(args: Record<string, unknown>): Promise<bigint>;
  writeContract(args: Record<string, unknown>): Promise<string>;
  signTypedData(args: Record<string, unknown>): Promise<string>;
}

// ============ Fetch & Compare Quotes ============

async function fetchLiquidityHubQuote(
  fromToken: string,
  toToken: string,
  inAmount: string,
  dexMinAmountOut: string,
  account: string,
  slippage: number,
  signal?: AbortSignal,
): Promise<Quote | null> {
  try {
    const quote = await lh.getQuote({
      fromToken,
      toToken,
      inAmount,
      dexMinAmountOut,
      account,
      slippage,
      signal,
    });
    return quote;
  } catch (error) {
    // Quote failed — will fall back to DEX
    return null;
  }
}

function shouldUseLiquidityHub(
  lhQuote: Quote | null,
  dexMinAmountOut: string,
): boolean {
  if (!lhQuote) return false;
  if (!isFreshQuote(lhQuote)) return false;

  return isLiquidityHubBetter(lhQuote, dexMinAmountOut);
}

// ============ Full Swap Flow ============

async function executeLiquidityHubSwap({
  quote,
  fromToken,
  account,
  wrappedTokenAddress,
  walletClient, // DEX: Your wallet client (ethers/viem/wagmi)
  waitForTransactionReceipt, // DEX: Your existing receipt waiter
  dexRouterData, // DEX: Optional { data, to } from DEX router for fallback
}: {
  quote: Quote;
  fromToken: string;
  account: string;
  wrappedTokenAddress: string;
  walletClient: WalletClient;
  /** Must reject when the receipt is reverted or otherwise unsuccessful. */
  waitForTransactionReceipt: (txHash: string) => Promise<void>;
  dexRouterData?: { data?: string; to?: string };
}): Promise<string> {
  const isNative = isNativeAddress(fromToken);

  // Step 1: Wrap native token if needed
  if (isNative) {
    lh.analytics.wrap.onRequest();
    try {
      // DEX: Replace with your wrap implementation
      const wrapTx = await walletClient.writeContract({
        abi: [
          {
            name: "deposit",
            type: "function",
            inputs: [],
            outputs: [],
            stateMutability: "payable",
          },
        ],
        functionName: "deposit",
        address: wrappedTokenAddress,
        value: BigInt(quote.inAmount),
      });
      await waitForTransactionReceipt(wrapTx);
      lh.analytics.wrap.onSuccess(wrapTx);
    } catch (error) {
      lh.analytics.wrap.onFailed(getErrorMessage(error));
      throw error;
    }
  }

  // Step 2: Approve Permit2 (one-time per token)
  const tokenToApprove = isNative ? wrappedTokenAddress : fromToken;
  const allowance = await walletClient.readContract({
    address: tokenToApprove,
    abi: [
      {
        name: "allowance",
        type: "function",
        inputs: [{ type: "address" }, { type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ],
    functionName: "allowance",
    args: [account, permit2Address],
  });

  if (BigInt(allowance) < BigInt(quote.inAmount)) {
    lh.analytics.approval.onRequest();
    try {
      const approveTx = await walletClient.writeContract({
        address: tokenToApprove,
        abi: [
          {
            name: "approve",
            type: "function",
            inputs: [{ type: "address" }, { type: "uint256" }],
            outputs: [{ type: "bool" }],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "approve",
        args: [permit2Address, maxUint256],
      });
      await waitForTransactionReceipt(approveTx);
      lh.analytics.approval.onSuccess(approveTx);
    } catch (error) {
      lh.analytics.approval.onFailed(getErrorMessage(error));
      throw error;
    }
  }

  // Step 3: Sign the quote (EIP-712)
  lh.analytics.signature.onRequest();
  let signature: string;
  try {
    signature = await walletClient.signTypedData({
      ...quote.eip712,
      account,
    });
    lh.analytics.signature.onSuccess(signature);
  } catch (error) {
    lh.analytics.signature.onFailed(getErrorMessage(error));
    throw error;
  }

  // Step 4: Execute the swap
  const txHash = await lh.swap(quote, signature, dexRouterData);

  // Step 5: Confirm through the DEX's existing wallet/RPC client
  try {
    await waitForTransactionReceipt(txHash);
    lh.analytics.swap.onSuccess();
  } catch (error) {
    lh.analytics.swap.onFailed(getErrorMessage(error));
    throw error;
  }

  return txHash;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

// ============ DEX Fallback ============

function reportDexSwap(
  fromToken: string,
  toToken: string,
  inAmount: string,
  txHash: string,
) {
  // Always report when falling back to DEX — helps the protocol optimize
  lh.analytics.dexSwap({
    panel: "main",
    router: "your-router-name", // DEX: Your router identifier
    srcTokenAddress: fromToken,
    dstTokenAddress: toToken,
    inAmount,
    txHash,
  });
}
