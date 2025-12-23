/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { getWrappedNativeCurrency } from "@/lib/utils";
import {
  isNativeAddress,
  OnApproveSuccessCallback,
  OnCancelOrderSuccess,
  OnWrapSuccessCallback,
  ParsedError,
  Partners,
  Token,
  Order,
} from "@orbs-network/spot-react";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import TokensPair from "@/components/tokens-pair";
import { useCurrency } from "@/lib/hooks/use-currencies";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import * as chains from "viem/chains";
import { getPartners } from "@orbs-network/spot-ui";
import { DEFAULT_PARTNER } from "../consts";

const useCallbacks = () => {
  const wrapToastId = useRef<number>(null);
  const approveToastId = useRef<number>(null);
  const createOrderToastId = useRef<number>(null);
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const { chainId } = useConnection();

  const symbol = useMemo(() => {
    return isNativeAddress(inputCurrency?.address)
      ? getWrappedNativeCurrency(chainId!)?.symbol ?? ""
      : inputCurrency?.symbol;
  }, [inputCurrency?.address, inputCurrency?.symbol, chainId]);

  const onWrapRequest = useCallback(() => {
    wrapToastId.current = toast.loading(
      `Wrapping ${inputCurrency?.symbol}...`,
      {
        description: "Proceed in wallet",
      }
    ) as number;
  }, [inputCurrency?.symbol]);

  const onWrapSuccess = useCallback(
    async ({ explorerUrl }: OnWrapSuccessCallback) => {
      toast.success(`Wrapped ${inputCurrency?.symbol}`, {
        description: (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            View on explorer
          </a>
        ),
        id: wrapToastId.current as number,
      });
    },
    [inputCurrency?.symbol]
  );

  const onApproveRequest = useCallback(() => {
    approveToastId.current = toast.loading(`Approving ${symbol}...`, {
      description: "Proceed in wallet",
    }) as number;
  }, [symbol]);

  const onApproveSuccess = useCallback(
    ({ explorerUrl }: OnApproveSuccessCallback) => {
      toast.success(`Approved ${symbol}`, {
        id: approveToastId.current as number,
        description: (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            View on explorer
          </a>
        ),
      });
    },
    [symbol]
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
      }
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
      />
    );
  }, []);

  const onSubmitOrderFailed = useCallback(({ code }: ParsedError) => {
    toast.error(`Failed to submit order: ${code}`);
  }, []);

  const onSubmitOrderRejected = useCallback(() => {
    toast.error("Order submission rejected", {
      id: createOrderToastId.current as number,
    });
  }, []);

  const onOrderCreated = useCallback((order: Order) => {
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
      }
    );
  }, []);

  const onOrderCancelled = useCallback((props: OnCancelOrderSuccess) => {
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
    onOrderCancelled,
    onCopy,
  };
};

export const SpotHooks = {
  useCallbacks,
};

export const useSpotToken = (address?: string) => {
  const currency = useCurrency(address);

  return useMemo((): Token | undefined => {
    if (!currency) return undefined;

    return {
      address: currency.address,
      decimals: currency.decimals,
      symbol: currency.symbol,
      logoUrl: currency.logoUrl,
    };
  }, [currency]);
};

export const useSpotMarketReferencePrice = () => {
  const { trade, isLoadingTrade } = useDerivedSwap();

  return useMemo(() => {
    return {
      value: trade?.outAmount,
      isLoading: isLoadingTrade,
    };
  }, [trade, isLoadingTrade]);
};

export const useSpotPartner = () => {
  const { partner } = useSwapParams();

  const { chainId } = useConnection();

  return useMemo(() => {
    const selected = partner?.split("_")[0];

    if (selected) {
      return selected as Partners;
    }
    if (!chainId) {
      return DEFAULT_PARTNER;
    }

    switch (chainId) {
      case chains.base.id:
      case chains.polygon.id:
        return Partners.Quick;
      case chains.bsc.id:
        return Partners.Thena;
      case chains.sonic.id:
        return Partners.Spooky;
      case chains.sei.id:
        return Partners.Nami;
      case chains.linea.id:
        return Partners.Lynex;
      default:
        return (
          getPartners().find((p) => p.chainId === chainId)?.partner ||
          DEFAULT_PARTNER
        );
    }
  }, [chainId, partner]);
};
