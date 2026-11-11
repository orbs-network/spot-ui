"use client";
import {
  type Step,
  SwapFlow,
  SwapStatus as SwapUiStatus,
} from "@orbs-network/swap-ui";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  ORBS_TWAP_FAQ_URL,
  Steps,
  ExecutionPhase,
  ExecutionStatus,
  useExecution,
  useOrderForm,
  type ParsedError,
  type Token,
} from "@orbs-network/spot-react";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { useTranslations } from "@/lib/use-translations";
import { Spinner } from "../ui/spinner";
import { SpotTokenLogo } from "./components";
import { formatDecimals, getExplorerUrl, getWrappedNativeCurrency } from "@/lib/utils";
import { ReviewFooter } from "../review-footer";
import styles from "../review-flow.module.css";

type SubmitOrderPanelProps = {
  orderTitle?: string;
  reviewDetails?: ReactNode;
};

type SubmitPanelContextType = SubmitOrderPanelProps & {
  inputToken?: Token;
  outputToken?: Token;
};

const SubmitPanelContext = createContext<SubmitPanelContextType>({});

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
  const { currentStep, wrapTxHash, approvalTxHash, status, chainId, phase } =
    useExecution();
  const t = useTranslations();
  const wrapExplorerUrl = getExplorerUrl(chainId, wrapTxHash);
  const approveExplorerUrl = getExplorerUrl(chainId, approvalTxHash);
  const symbol = inputToken?.symbol || "";
  const swapTitle = useTitle();

  return useMemo((): Step | undefined => {
    if (phase === ExecutionPhase.SETTLING) {
      return { title: "Checking order status", footerText: "Checking the original order…" };
    }
    if (phase === ExecutionPhase.PREPARING) {
      return { title: "Checking allowance", footerText: "Checking token allowance…" };
    }
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
  }, [phase, currentStep, approveExplorerUrl, symbol, swapTitle, t, wrapExplorerUrl, status]);
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
  const { status, isPreparingOrder, totalSteps } = useExecution();
  const t = useTranslations();
  const isSubmitted = Boolean(status) && !(isPreparingOrder && !totalSteps);
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
        <ReviewFooter details={
            <>
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
            </>
          }>
          {reviewDetails}
        </ReviewFooter>
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

// Spot execution and swap-ui are independently versioned, so map their enums explicitly.
const getSwapUiStatus = (status?: ExecutionStatus): SwapUiStatus | undefined => {
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return SwapUiStatus.SUCCESS;
    case ExecutionStatus.FAILED:
      return SwapUiStatus.FAILED;
    case ExecutionStatus.LOADING:
      return SwapUiStatus.LOADING;
    default:
      return undefined;
  }
};

export const SubmitOrderPanel = (props: SubmitOrderPanelProps) => {
  const panelData = useExecution();
  const { inputToken, outputToken } = panelData;

  return (
    <SubmitPanelContext.Provider value={{ ...props, inputToken, outputToken }}>
      <SubmitOrderFlow panelData={panelData} />
    </SubmitPanelContext.Provider>
  );
};

const SubmitOrderFlow = ({
  panelData,
}: {
  panelData: ReturnType<typeof useExecution>;
}) => {
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

  const inputAmountF = formatDecimals(formData.inputAmount.ui, 2, inputToken?.decimals ?? 18);
  const outputAmountF = formatDecimals(formData.outputAmount.ui, 2, outputToken?.decimals ?? 18);

  const inToken = useMemo(
    () => ({ symbol: inputToken?.symbol, logoUrl: inputToken?.logoUrl }),
    [inputToken],
  );
  const outToken = useMemo(
    () => ({ symbol: outputToken?.symbol, logoUrl: outputToken?.logoUrl }),
    [outputToken],
  );

  // Step and title hooks consume the same context as the rendered flow content.
  const currentStep = useStep();
  // Once wallet steps are visible, live checks must keep the progress screen mounted.
  const swapStatus = isPreparingOrder && !totalSteps ? undefined : getSwapUiStatus(status);

  return (
    <SwapFlow
      className={styles.flow}
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
  );
};
