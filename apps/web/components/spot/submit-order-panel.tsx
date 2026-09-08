"use client";
import {
  Step,
  SwapFlow,
  SwapStatus as SwapUiStatus,
} from "@orbs-network/swap-ui";
import { createContext, ReactNode, useContext, useMemo } from "react";
import {
  ORBS_TWAP_FAQ_URL,
  Steps,
  ExecutionStatus,
  useExecution,
  useOrderForm,
  type ParsedError,
  type Token,
} from "@orbs-network/spot-react";
import { useFormatNumber } from "@/lib/hooks/common";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { useTranslations } from "@/lib/use-translations";
import { Spinner } from "../ui/spinner";
import { SpotTokenLogo } from "./components";
import { getExplorerUrl, getWrappedNativeCurrency } from "@/lib/utils";

type SubmitOrderPanelProps = {
  orderTitle?: string;
  reviewDetails?: ReactNode;
};


type SubmitPanelContextType =  SubmitOrderPanelProps & {
  inputToken?: Token;
  outputToken?: Token;
};

const SubmitPanelContext = createContext(
  {} as SubmitPanelContextType,
);

const useSubmitPanelContext = () => useContext(SubmitPanelContext);

const WrapMsg = () => {
  const t = useTranslations();
  const { inputToken } = useSubmitPanelContext();
  const { wrapTxHash, chainId } = useExecution();
  const wSymbol = getWrappedNativeCurrency(chainId)?.symbol;

  if (!wrapTxHash) {
    return null;
  }

  return (
    <p className="twap-error-wrap-msg">
      {t("wrapMsg", {
        symbol: inputToken?.symbol || "",
        wSymbol: wSymbol || "",
      })}
    </p>
  );
};

const useTitle = () => {
  const t = useTranslations();
  const { orderTitle = "" } = useSubmitPanelContext();
  const { status } = useExecution();

  if (status === ExecutionStatus.SUCCESS) {
    return t("createOrderActionSuccess", { name: orderTitle });
  }

  return t("createOrderAction", { name: orderTitle });
};

const useStep = () => {
  const { inputToken } = useSubmitPanelContext();
  const { currentStep, wrapTxHash, approvalTxHash, status, chainId } =
    useExecution();
  const t = useTranslations();
  const wrapExplorerUrl = getExplorerUrl(chainId, wrapTxHash);
  const approveExplorerUrl = getExplorerUrl(chainId, approvalTxHash);
  const symbol = inputToken?.symbol || "";
  const swapTitle = useTitle();
  

  

  return useMemo((): Step | undefined => {
    if (currentStep === Steps.WRAP) {
      return {
        title: t("wrapAction", { symbol }),
        footerLink: wrapExplorerUrl,
        footerText: wrapExplorerUrl
          ? t("viewOnExplorer")
          : t("proceedInWallet"),
      };
    }
    if (currentStep === Steps.APPROVE) {
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
        status === ExecutionStatus.LOADING ? t("proceedInWallet") : undefined,
    };
  }, [currentStep, approveExplorerUrl, symbol, swapTitle, t, wrapExplorerUrl, status]);
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
  const { inputToken, outputToken, reviewDetails } =
    useSubmitPanelContext();
  const { status, isPreparingOrder } = useExecution();
  const t = useTranslations();
  const isSubmitted = Boolean(status) && !isPreparingOrder;
  const order = useOrderForm();

  return (
    <>
      <SwapFlow.Main
        fromTitle={t("from")}
        toTitle={t("to")}
        inUsd={
          <FormatNumber
            value={order.inputAmount.usd}
            decimalScale={2}
            prefix="$"
          />
        }
        outUsd={
          <FormatNumber
            value={order.outputAmount.usd}
            decimalScale={2}
            prefix="$"
          />
        }
      />
      {!isSubmitted && (
        <div className="twap-create-order-bottom">
          <OrderDetails.Container>
            <div className="twap-create-order-details">
              <OrderDetails.Duration
                durationMillis={order.schedule.durationMillis}
                label={t("expirationLabel")}
                tooltip={t("expirationTooltip")}
              />
              <OrderDetails.Price
                inputToken={inputToken}
                price={order.triggerPrice.display.ui}
                outputToken={outputToken}
                label={t("triggerPrice")}
                tooltip={t("triggerPriceTooltip")}
                usd={order.triggerPrice.display.usd}
              />
              <OrderDetails.Price
                inputToken={inputToken}
                price={order.limitPrice.display.ui}
                outputToken={outputToken}
                label={t("limitPrice")}
                usd={order.limitPrice.display.usd}
                tooltip={t("limitPriceTooltip")}
              />
              <OrderDetails.MinOutputAmount
                outputToken={outputToken}
                minOutputAmount={order.trades.minOutputAmountPerTrade.ui}
                label={t(order.trades.totalTrades > 1 ? "minReceivedPerTrade" : "minReceived")}
                tooltip={t("minDstAmountTooltip")}
                usd={order.trades.minOutputAmountPerTrade.usd}
              />
              <OrderDetails.TradeSize
                tradeSize={order.trades.inputAmountPerTrade.ui}
                trades={order.trades.totalTrades}
                inputToken={inputToken}
                label={t("individualTradeSize")}
                tooltip={t("tradeSizeTooltip")}
              />
              <OrderDetails.TradesAmount
                trades={order.trades.totalTrades}
                label={t("numberOfTrades")}
                tooltip={t("totalTradesTooltip")}
              />
              <OrderDetails.TradeInterval
                chunks={order.trades.totalTrades}
                fillDelayMillis={order.schedule.fillDelayMillis}
                label={t("tradeIntervalLabel")}
                tooltip={t("tradeIntervalTooltip")}
              />
              <OrderDetails.Recipient />
              {order.fees.raw && (
                <OrderDetails.Fees
                  fees={order.fees.ui}
                  label={t("fees", { value: `${order.fees.percentage}%` })}
                  usd={order.fees.usd}
                  outputTokenSymbol={outputToken?.symbol}
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
  const panelData = useExecution();
  
  const {
    status,
    isPreparingOrder,
    currentStepIndex,
    totalSteps,
    error,
    inputToken,
    outputToken,
  } = panelData;
  const formData = useOrderForm();

  const inputAmountF = useFormatNumber({
    value: formData.inputAmount.ui,
    decimalScale: 2,
  });
  const outputAmountF = useFormatNumber({
    value: formData.outputAmount.ui,
    decimalScale: 2,
  });

  const inToken = useMemo(
    () => ({ symbol: inputToken?.symbol, logoUrl: inputToken?.logoUrl }),
    [inputToken],
  );
  const outToken = useMemo(
    () => ({ symbol: outputToken?.symbol, logoUrl: outputToken?.logoUrl }),
    [outputToken],
  );

  const currentStep = useStep();
  const swapStatus =
    isPreparingOrder
      ? undefined
      : status === ExecutionStatus.SUCCESS
        ? SwapUiStatus.SUCCESS
        : status === ExecutionStatus.FAILED
          ? SwapUiStatus.FAILED
          : status === ExecutionStatus.LOADING
            ? SwapUiStatus.LOADING
            : undefined;

  return (
    <SubmitPanelContext.Provider value={{ ...panelData, ...props, inputToken, outputToken }}>
      <SwapFlow
        inAmount={inputAmountF}
        outAmount={outputAmountF}
        swapStatus={swapStatus}
        totalSteps={totalSteps}
        currentStep={currentStep}
        currentStepIndex={currentStepIndex}
        inToken={inToken}
        outToken={outToken}
        components={{
          SrcTokenLogo: <SpotTokenLogo token={inputToken} />,
          DstTokenLogo: <SpotTokenLogo token={outputToken} />,
          Failed: <Failed error={error} />,
          Success: <SuccessContent />,
          Main: <Main />,
          Loader: <Spinner className="size-18" />,
        }}
      />
    </SubmitPanelContext.Provider>
  );
};
