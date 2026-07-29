import { analyticsInstance } from "./analytics";
import { DexRouterData, Quote } from "./types";
import { getApiUrl, delay, devLog } from "./util";

interface Args {
  signature: string;
  inTokenAddress: string;
  outTokenAddress: string;
  fromAmount: string;
  quote?: Quote;
  account: string;
  chainId: number;
  apiUrl: string;
  dexTx?: any;
  sessionId?: string;
}

const swapX = async (args: Args) => {
  const { account, chainId, apiUrl } = args;
  try {
    if (!args.quote) {
      throw new Error("Missing quote");
    }
    const response = await fetch(`${apiUrl}/swap-async?chainId=${chainId}`, {
      method: "POST",
      body: JSON.stringify({
        ...args.quote,
        inToken: args.inTokenAddress,
        outToken: args.outTokenAddress,
        inAmount: args.fromAmount,
        user: account,
        signature: args.signature,
        dexTx: args.dexTx,
        sessionId: args.sessionId,
      }),
    });
    const swap = await response.json();
    if (!swap) {
      throw new Error("missing swap response");
    }
    if (swap.error) {
      throw new Error(swap.error);
    }
    if (!swap.txHash) {
      throw new Error("missing txHash");
    }
    return swap.txHash;
  } catch (error: any) {
    throw new Error(error?.message ?? String(error));
  }
};

export const swap = async (
  quote: Quote,
  signature: string,
  chainId?: number,
  dexRouterData?: DexRouterData
) => {
  if (!chainId) {
    throw new Error("chainId is missing in constructSDK");
  }

  const apiUrl = getApiUrl(chainId);
  devLog("swap start", { signature, txData: dexRouterData, quote });
  analyticsInstance.onSwapRequest(quote,dexRouterData);

  // Fire the submission and poll for the on-chain tx hash in parallel. We race
  // the two so that a submission failure (bad signature, validation, 4xx)
  // surfaces immediately instead of only after the ~60s poll times out.
  const submission = swapX({
    signature,
    inTokenAddress: quote.inToken,
    outTokenAddress: quote.outToken,
    fromAmount: quote.inAmount,
    quote,
    account: quote.user,
    chainId,
    apiUrl,
    dexTx: dexRouterData,
    sessionId: quote.sessionId,
  });

  // A resolved submission does not end the swap (the tx hash still comes from
  // polling); only a rejection short-circuits the race.
  const submissionRacer = submission.then(() => new Promise<string>(() => {}));
  // If the poll wins the race first, this promise is abandoned — swallow any
  // late rejection so it doesn't surface as an unhandled promise rejection.
  submissionRacer.catch(() => {});

  try {
    const txHash = await Promise.race([
      waitForSwap({
        sessionId: quote.sessionId,
        apiUrl,
        user: quote.user,
        chainId,
      }),
      submissionRacer,
    ]);

    if (!txHash) {
      throw new Error("failed to get tx hash");
    }
    analyticsInstance.onSwapTxHash(txHash);
    devLog("swap tx hash", { txHash });
    return txHash;
  } catch (error) {
    devLog("swap failed", { error });

    analyticsInstance.onSwapFailed((error as any).message);
    throw error;
  }
};

type TxDetailsFromApi = {
  status: string;
  exactOutAmount: string;
  gasCharges: string;
  isMined?: boolean;
};

export const getTxDetails = async (
  txHash: string,
  quote?: Quote,
  chainId?: number
): Promise<TxDetailsFromApi> => {
  if (!chainId) {
    throw new Error("chainId is missing in constructSDK");
  }
  devLog("fetching tx details", { txHash });

  const apiUrl = getApiUrl(chainId);
  for (let i = 0; i < 10; ++i) {
    await delay(2_500);
    let result: any;
    try {
      const response = await fetch(
        `${apiUrl}/tx/${txHash}?chainId=${chainId}`,
        {
          method: "POST",
          body: JSON.stringify({
            outToken: quote?.outToken,
            user: quote?.user,
            qs: quote?.qs,
            partner: quote?.partner,
            sessionId: quote?.sessionId,
          }),
        }
      );

      result = await response?.json();
    } catch (error: any) {
      // Transient network/parse error — retry on the next iteration instead of
      // aborting the whole retry loop on the first failure.
      devLog("tx details failed, retrying", { error });
      continue;
    }

    // A definitive backend error or a terminal failure status should surface
    // immediately, not be retried and then misreported as a timeout.
    if (result?.error) {
      throw new Error(result.error);
    }
    const status = result?.status?.toLowerCase();
    if (status === "mined") {
      devLog("tx details", { details: result });

      return {
        ...result,
        isMined: true,
      };
    }
    if (status === "failed" || status === "reverted") {
      throw new Error(`transaction ${status}`);
    }
  }
  throw new Error("swap timeout");
};

async function waitForSwap({
  chainId,
  user,
  apiUrl,
  sessionId,
}: {
  chainId: number;
  user: string;
  apiUrl: string;
  sessionId: string;
}) {
  // wait for swap to be processed, check every 2 seconds, for 1 minute
  for (let i = 0; i < 30; ++i) {
    await delay(2_000);
    let result: any;
    try {
      const response = await fetch(
        `${apiUrl}/swap/status/${sessionId}?chainId=${chainId}`,
        {
          method: "POST",
          body: JSON.stringify({ user }),
        }
      );
      result = await response.json();
    } catch (error: any) {
      // Transient network/parse error — keep polling instead of aborting.
      devLog("swap status poll failed, retrying", { error });
      continue;
    }

    // A definitive backend error should propagate, not be retried/swallowed.
    if (result?.error) {
      throw new Error(result.error);
    }

    if (result?.txHash) {
      return result.txHash as string;
    }
  }
  throw new Error("swap timeout");
}
