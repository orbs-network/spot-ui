import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { getExplorerUrl, getWrappedNativeCurrency, isNativeAddress } from "@/lib/utils";
import {
  OnApproveSuccessCallback,
  OnWrapSuccessCallback,
  ParsedError,
  Partners,
  Order,
  type MarketQuote,
} from "@orbs-network/spot-react";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

import TokensPair from "@/components/tokens-pair";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useSelectedFormTab } from "./use-tabs";
import { TABS } from "../types";
import { DEFAULT_PARTNER } from "../consts";
import { useRefetchSelectedCurrenciesBalances } from "./use-balances";

const ExplorerToastLink = ({ chainId, txHash }: { chainId: number; txHash: string }) => (
  <a
    href={getExplorerUrl(chainId, txHash)}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm text-blue-500 hover:text-blue-600"
  >
    View on explorer
  </a>
);

export const useCallbacks = () => {
  const wrapToastId = useRef<number>(null);
  const approveToastId = useRef<number>(null);
  const createOrderToastId = useRef<number>(null);
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const chainId = useActiveChainId();
  const isSwap = useSelectedFormTab()?.value === TABS.SWAP;
  const { mutateAsync: refetchBalances } =
    useRefetchSelectedCurrenciesBalances();

  const symbol = useMemo(() => {
    return isNativeAddress(inputCurrency?.address)
      ? (getWrappedNativeCurrency(chainId!)?.symbol ?? "")
      : inputCurrency?.symbol;
  }, [inputCurrency?.address, inputCurrency?.symbol, chainId]);

  const onWrapRequest = useCallback(() => {
    wrapToastId.current = toast.loading(
      `Wrapping ${inputCurrency?.symbol}...`,
      {
        description: "Proceed in wallet",
      },
    ) as number;
  }, [inputCurrency?.symbol]);

  const onWrapSuccess = useCallback(
    async ({ txHash }: OnWrapSuccessCallback) => {
      const wrappedNativeCurrency = getWrappedNativeCurrency(chainId);
      toast.success(`Wrapped ${inputCurrency?.symbol}`, {
        description: <ExplorerToastLink chainId={chainId} txHash={txHash} />,
        id: wrapToastId.current as number,
      });
      // Keep the selected native token unchanged. Switching it here changes
      // the Spot form scope and clears the terminal execution before the
      // success UI can render. Include the wrapped token explicitly because it
      // is not part of the selected native/output pair.
      await refetchBalances(
        wrappedNativeCurrency?.address ? [wrappedNativeCurrency.address] : [],
      );
    },
    [inputCurrency?.symbol, chainId, refetchBalances],
  );

  const onApproveRequest = useCallback(() => {
    approveToastId.current = toast.loading(`Approving ${symbol}...`, {
      description: "Proceed in wallet",
    }) as number;
  }, [symbol]);

  const onApproveSuccess = useCallback(
    ({ txHash }: OnApproveSuccessCallback) => {
      toast.success(`Approved ${symbol}`, {
        id: approveToastId.current as number,
        description: <ExplorerToastLink chainId={chainId} txHash={txHash} />,
      });
    },
    [chainId, symbol],
  );

  const onSignOrderRequest = useCallback(() => {
    createOrderToastId.current = toast.loading(
      <TokensPair
        prefix="Creating order"
        srcTokenAddress={inputCurrency?.address}
        dstTokenAddress={outputCurrency?.address}
      />,
      {
        description: "Proceed in wallet",
      },
    ) as number;
  }, [inputCurrency?.address, outputCurrency?.address]);

  const onCreateOrderSuccess = useCallback(() => {
    toast.success("Order created", {
      id: createOrderToastId.current as number,
    });
  }, []);

  const onOrderFilled = useCallback((order: Order) => {
    toast.success(
      <TokensPair
        prefix="Order filled"
        srcTokenAddress={order.srcTokenAddress}
        dstTokenAddress={order.dstTokenAddress}
      />,
    );
  }, []);

  const onSubmitOrderFailed = useCallback(({ code }: ParsedError) => {
    toast.dismiss(createOrderToastId.current as number);
    toast.error(`Failed to submit order: ${code}`);
  }, []);

  const onSubmitOrderRejected = useCallback(() => {
    toast.dismiss(createOrderToastId.current as number);
    toast.error("Order submission rejected", {
      id: createOrderToastId.current as number,
    });
  }, []);

  const onOrderCreated = useCallback((order: Order) => {
    if (isSwap) {
      toast.dismiss(createOrderToastId.current as number);
      return;
    }
    toast.success(
      <TokensPair
        prefix="Order created"
        srcTokenAddress={order.srcTokenAddress}
        dstTokenAddress={order.dstTokenAddress}
      />,
      {
        id: createOrderToastId.current as number,
        duration: 10_000,
        closeButton: true,
        description: "",
      },
    );
  }, [isSwap]);

  const onOrdersProgressUpdate = useCallback(() => {
    void refetchBalances([]).catch(() => undefined);
  }, [refetchBalances]);

  const onOrderCancelled = useCallback(() => {
    toast.success("Order cancelled");
  }, []);

  const onCopy = useCallback(() => {
    toast.success("Copied to clipboard");
  }, []);

  return {
    onWrapRequest,
    onApproveRequest,
    onSignOrderRequest,
    onWrapSuccess,
    onApproveSuccess,
    onCreateOrderSuccess,
    onOrderFilled,
    onSubmitOrderFailed,
    onSubmitOrderRejected,
    onOrderCreated,
    onOrdersProgressUpdate,
    onOrderCancelled,
    onCopy,
  };
};

export const useSpotMarketQuote = (): MarketQuote => {
  const { trade, isLoadingTrade } = useDerivedSwap();

  return useMemo(() => {
    return {
      quotedOutputAmountRaw: isLoadingTrade ? undefined : trade?.outAmount,
      noLiquidity: !isLoadingTrade && !trade,
      isLoading: isLoadingTrade,
    };
  }, [trade, isLoadingTrade]);
};

export const useSpotPartner = (): Partners => {
  const { parsedPartner } = useSwapParams();
  return (parsedPartner as Partners | undefined) ?? DEFAULT_PARTNER;
};

export { useWalletInteractions } from "./use-wallet-interactions";
