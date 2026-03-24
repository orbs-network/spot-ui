/**
 * Liquidity Hub Integration Example
 *
 * This is a simplified example showing the full swap flow.
 * Adapt to your DEX's framework (React hooks, Vue composables, etc.)
 */

import {
  constructSDK,
  isFreshQuote,
  permit2Address,
  nativeTokenAddresses,
  type Quote,
  type LiquidityHubSDK,
} from "@orbs-network/liquidity-hub-sdk";

// ============ Initialize SDK ============

// Create one instance per chain — re-create when chain changes
const lh: LiquidityHubSDK = constructSDK({
  chainId: 137,       // DEX: Replace with active chain ID
  partner: "myDex",   // DEX: Replace with your registered partner name
});

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

  const lhOutput = BigInt(lhQuote.minAmountOut);
  const dexOutput = BigInt(dexMinAmountOut);

  return lhOutput > dexOutput;
}

// ============ Full Swap Flow ============

async function executeLiquidityHubSwap({
  quote,
  fromToken,
  account,
  wrappedTokenAddress,
  walletClient,  // DEX: Your wallet client (ethers/viem/wagmi)
  dexRouterData, // DEX: Optional { data, to } from DEX router for fallback
}: {
  quote: Quote;
  fromToken: string;
  account: string;
  wrappedTokenAddress: string;
  walletClient: any;
  dexRouterData?: { data?: string; to?: string };
}): Promise<string> {
  const isNative = nativeTokenAddresses.some(
    (addr) => addr.toLowerCase() === fromToken.toLowerCase(),
  );

  // Step 1: Wrap native token if needed
  if (isNative) {
    lh.analytics.wrap.onRequest();
    try {
      // DEX: Replace with your wrap implementation
      const wrapTx = await walletClient.writeContract({
        abi: [{ name: "deposit", type: "function", inputs: [], outputs: [], stateMutability: "payable" }],
        functionName: "deposit",
        address: wrappedTokenAddress,
        value: BigInt(quote.inAmount),
      });
      // DEX: Wait for transaction confirmation
      lh.analytics.wrap.onSuccess(wrapTx);
    } catch (error: any) {
      lh.analytics.wrap.onFailed(error.message);
      throw error;
    }
  }

  // Step 2: Approve Permit2 (one-time per token)
  const tokenToApprove = isNative ? wrappedTokenAddress : fromToken;
  const allowance = await walletClient.readContract({
    address: tokenToApprove,
    abi: [{ name: "allowance", type: "function", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
    functionName: "allowance",
    args: [account, permit2Address],
  });

  if (BigInt(allowance) < BigInt(quote.inAmount)) {
    lh.analytics.approval.onRequest();
    try {
      const maxApproval = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      const approveTx = await walletClient.writeContract({
        address: tokenToApprove,
        abi: [{ name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" }],
        functionName: "approve",
        args: [permit2Address, maxApproval],
      });
      // DEX: Wait for transaction confirmation
      lh.analytics.approval.onSuccess(approveTx);
    } catch (error: any) {
      lh.analytics.approval.onFailed(error.message);
      throw error;
    }
  }

  // Step 3: Sign the quote (EIP-712)
  lh.analytics.signature.onRequest();
  let signature: string;
  try {
    signature = await walletClient.signTypedData({
      domain: quote.permitData.domain,
      types: quote.permitData.types,
      primaryType: quote.permitData.primaryType,
      message: quote.permitData.values,
      account,
    });
    lh.analytics.signature.onSuccess(signature);
  } catch (error: any) {
    lh.analytics.signature.onFailed(error.message);
    throw error;
  }

  // Step 4: Execute the swap
  const txHash = await lh.swap(quote, signature, dexRouterData);
  lh.analytics.swap.onSuccess();

  // Step 5: Get transaction details
  const details = await lh.getTransactionDetails(txHash, quote);
  if (details.isMined) {
    console.log("Swap confirmed! Output:", details.exactOutAmount);
  }

  return txHash;
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
    router: "your-router-name",  // DEX: Your router identifier
    srcTokenAddress: fromToken,
    dstTokenAddress: toToken,
    inAmount,
    txHash,
  });
}
