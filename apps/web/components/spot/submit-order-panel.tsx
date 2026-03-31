"use client";
import { Step, SwapFlow } from "@orbs-network/swap-ui";
import { createContext, ReactNode, useContext, useMemo } from "react";
import {
  useSubmitOrderPanel as useSubmitOrderPanelHook,
  isNativeAddress,
  ORBS_TWAP_FAQ_URL,
  useExplorerLink,
  useFormatNumber,
  useNetwork,
  useOrder,
  Steps,
  SwapStatus,
  type ParsedError,
} from "@orbs-network/spot-react";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { useTranslations } from "@/lib/use-translations";
import { Spinner } from "../ui/spinner";
import { SpotTokenLogo } from "./components";

type SubmitOrderPanelProps = {
  reviewDetails?: ReactNode;
  orderTitle?: string;
};

type SubmitOrderPanelData = ReturnType<typeof useSubmitOrderPanelHook>;

const SubmitPanelContext = createContext(
  {} as SubmitOrderPanelData & SubmitOrderPanelProps,
);

const useSubmitPanelContext = () => useContext(SubmitPanelContext);

const WrapMsg = () => {
  const t = useTranslations();
  const { wrapTxHash, srcToken } = useSubmitPanelContext();
  const wSymbol = useNetwork()?.wToken?.symbol;

  if (!wrapTxHash) {
    return null;
  }

  return (
    <p className="twap-error-wrap-msg">
      {t("wrapMsg", {
        symbol: srcToken?.symbol || "",
        wSymbol: wSymbol || "",
      })}
    </p>
  );
};

const useTitle = () => {
  const t = useTranslations();
  const { status, orderTitle = "" } = useSubmitPanelContext();

  if (status === SwapStatus.SUCCESS) {
    return t("createOrderActionSuccess", { name: orderTitle });
  }

  return t("createOrderAction", { name: orderTitle });
};

const useStep = () => {
  const { srcToken, step, wrapTxHash, approveTxHash, status } =
    useSubmitPanelContext();
  const t = useTranslations();
  const network = useNetwork();
  const wrapExplorerUrl = useExplorerLink(wrapTxHash);
  const approveExplorerUrl = useExplorerLink(approveTxHash);
  const isNativeIn = isNativeAddress(srcToken?.address || "");
  const symbol = isNativeIn
    ? network?.native.symbol || ""
    : srcToken?.symbol || "";
  const swapTitle = useTitle();

  return useMemo((): Step | undefined => {
    if (step === Steps.WRAP) {
      return {
        title: t("wrapAction", { symbol }),
        footerLink: wrapExplorerUrl,
        footerText: wrapExplorerUrl
          ? t("viewOnExplorer")
          : t("proceedInWallet"),
      };
    }
    if (step === Steps.APPROVE) {
      return {
        title: t("approveAction", { symbol }),
        footerLink: approveExplorerUrl,
        footerText: approveExplorerUrl
          ? t("viewOnExplorer")
          : t("proceedInWallet"),
      };
    }
    return {
      title: swapTitle,
      footerText:
        status === SwapStatus.LOADING ? t("proceedInWallet") : undefined,
    };
  }, [step, approveExplorerUrl, symbol, swapTitle, t, wrapExplorerUrl, status]);
};

const TxError = ({ error }: { error?: ParsedError }) => {
  return (
    <div className="twap-error">
      <h2 className="twap-error-title">Transaction failed</h2>
      {error?.code && (
        <p className="twap-error-code">Error code: {error?.code}</p>
      )}
      <WrapMsg />
    </div>
  );
};

function Failed({ error }: { error?: ParsedError }) {
  const t = useTranslations();

  return (
    <SwapFlow.Failed
      error={<TxError error={error} />}
      footerLink={ORBS_TWAP_FAQ_URL}
      footerText={t("viewOnExplorer")}
    />
  );
}

const Main = () => {
  const { srcToken, dstToken, status, reviewDetails } =
    useSubmitPanelContext();
  const t = useTranslations();
  const isSubmitted = Boolean(status);
  const order = useOrder();

  return (
    <>
      <SwapFlow.Main
        fromTitle={t("from")}
        toTitle={t("to")}
        inUsd={
          <FormatNumber value={order.srcAmountUsd} decimalScale={2} prefix="$" />
        }
        outUsd={
          <FormatNumber value={order.dstAmountUsd} decimalScale={2} prefix="$" />
        }
      />
      {!isSubmitted && (
        <div className="twap-create-order-bottom">
          <OrderDetails.Container>
            <div className="twap-create-order-details">
              <OrderDetails.Deadline
                deadline={order.deadline}
                label={t("expirationLabel")}
                tooltip={t("expirationTooltip")}
              />
              <OrderDetails.Price
                srcToken={srcToken}
                price={order.triggerPriceUI}
                dstToken={dstToken}
                label={t("triggerPrice")}
                tooltip={t("triggerPriceTooltip")}
                usd={order.triggerPriceUsd}
              />
              <OrderDetails.Price
                srcToken={srcToken}
                price={order.limitPriceUI}
                dstToken={dstToken}
                label={t("limitPrice")}
                usd={order.limitPriceUsd}
                tooltip={t("limitPriceTooltip")}
              />
              <OrderDetails.MinDestAmount
                dstToken={dstToken}
                dstMinAmountOut={order.minDestAmountPerTradeUI}
                label={t(order.totalTrades > 1 ? "minReceivedPerTrade" : "minReceived")}
                tooltip={t("minDstAmountTooltip")}
                usd={order.minDestAmountPerTradeUsd}
              />
              <OrderDetails.TradeSize
                tradeSize={order.sizePerTradeUI}
                trades={order.totalTrades}
                srcToken={srcToken}
                label={t("individualTradeSize")}
                tooltip={t("tradeSizeTooltip")}
              />
              <OrderDetails.TradesAmount
                trades={order.totalTrades}
                label={t("numberOfTrades")}
                tooltip={t("totalTradesTooltip")}
              />
              <OrderDetails.TradeInterval
                chunks={order.totalTrades}
                fillDelayMillis={order.tradeInterval}
                label={t("tradeIntervalLabel")}
                tooltip={t("tradeIntervalTooltip")}
              />
              <OrderDetails.Recipient />
              {order.feesAmount && (
                <OrderDetails.Fees
                  fees={order.feesAmount}
                  label={t("fees", { value: `${order.feesPercentage}%` })}
                  usd={order.feesUsd}
                  dstTokenSymbol={dstToken?.symbol}
                />
              )}
            </div>
          </OrderDetails.Container>
          {reviewDetails}
        </div>
      )}
    </>
  );
};

const SuccessContent = () => {
  const successTitle = useTitle();

  return (
    <>
      <SwapFlow.Success title={successTitle} />
      <WrapMsg />
    </>
  );
};

export const SubmitOrderPanel = (props: SubmitOrderPanelProps) => {
  const panelData = useSubmitOrderPanelHook();
  const { status, stepIndex, totalSteps, parsedError, srcToken, dstToken } =
    panelData;

  const order = useOrder();
  const srcAmountF = useFormatNumber({ value: order.srcAmountUI, decimalScale: 2 });
  const outAmountF = useFormatNumber({ value: order.dstAmountUI, decimalScale: 2 });

  const inToken = useMemo(
    () => ({ symbol: srcToken?.symbol, logoUrl: srcToken?.logoUrl }),
    [srcToken],
  );
  const outToken = useMemo(
    () => ({ symbol: dstToken?.symbol, logoUrl: dstToken?.logoUrl }),
    [dstToken],
  );

  return (
    <SubmitPanelContext.Provider value={{ ...panelData, ...props }}>
      <SwapFlow
        inAmount={srcAmountF}
        outAmount={outAmountF}
        swapStatus={status as unknown as SwapStatus}
        totalSteps={totalSteps}
        currentStep={useStep()}
        currentStepIndex={stepIndex}
        inToken={inToken}
        outToken={outToken}
        components={{
          SrcTokenLogo: <SpotTokenLogo token={srcToken} />,
          DstTokenLogo: <SpotTokenLogo token={dstToken} />,
          Failed: <Failed error={parsedError} />,
          Success: <SuccessContent />,
          Main: <Main />,
          Loader: <Spinner className="size-18" />,
        }}
      />
    </SubmitPanelContext.Provider>
  );
};
