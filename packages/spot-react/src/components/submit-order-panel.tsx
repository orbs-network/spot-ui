import { Step, SwapFlow, SwapStatus } from "@orbs-network/swap-ui";
import { createContext, ReactNode, useContext, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import {
  isNativeAddress,
  ORBS_TWAP_FAQ_URL,
} from "@orbs-network/spot-ui";
import { ParsedError, Steps, SubmitOrderPanelProps } from "../types";
import { useSpotStore } from "../store";
import {
  useExplorerLink,
  useFormatNumber,
  useNetwork,
} from "../hooks/helper-hooks";
import { useSrcAmount } from "../hooks/use-src-amount";
import { useDstTokenAmount } from "../hooks/use-dst-amount";
import { OrderDetails } from "../components/order-details";
import { useTranslations } from "../hooks/use-translations";
import { useOrderInfo } from "../hooks/use-order";
import { useCurrentOrderTitle } from "../hooks/order-hooks";

const Context = createContext({} as SubmitOrderPanelProps);

type Props = SubmitOrderPanelProps & {
  children: ReactNode;
};

export const SubmitOrderContextProvider = ({ children, ...rest }: Props) => {
  return <Context.Provider value={rest}>{children}</Context.Provider>;
};

export const useSubmitOrderPanelContext = () => {
  return useContext(Context);
};

const WrapMsg = () => {
  const t = useTranslations();
  const { wrapTxHash, srcToken } = useSpotStore((s) => s.state.swapExecution);
  const wSymbol = useNetwork()?.wToken?.symbol;

  if (!wrapTxHash) {
    return null;
  }

  return (
    <p className="twap-error-wrap-msg">
      {t("wrapMsg", { symbol: srcToken?.symbol || "", wSymbol: wSymbol || "" })}
    </p>
  );
};

const useTitle = () => {
  const t = useTranslations();
  const status = useSpotStore((s) => s.state.swapExecution.status);
  const orderName = useCurrentOrderTitle();

  if (status === SwapStatus.SUCCESS) {
    return t("createOrderActionSuccess", { name: orderName });
  }

  return t("createOrderAction", { name: orderName });
};

const useStep = () => {
  const srcToken = useSpotStore((s) => s.state.swapExecution.srcToken);
  const t = useTranslations();
  const { step, wrapTxHash, approveTxHash } = useSpotStore(
    (s) => s.state.swapExecution,
  );
  const network = useNetwork();
  const wrapExplorerUrl = useExplorerLink(wrapTxHash);
  const unwrapExplorerUrl = useExplorerLink(wrapTxHash);
  const approveExplorerUrl = useExplorerLink(approveTxHash);
  const status = useSpotStore((s) => s.state.swapExecution.status);
  const isNativeIn = isNativeAddress(srcToken?.address || "");
  const symbol = isNativeIn
    ? network?.native.symbol || ""
    : srcToken?.symbol || "";
  const wSymbol = network?.wToken.symbol;
  const swapTitle = useTitle();

  return useMemo((): Step | undefined => {
    if (step === Steps.WRAP) {
      return {
        title: t("wrapAction", { symbol: symbol }),
        footerLink: wrapExplorerUrl,
        footerText: wrapExplorerUrl
          ? t("viewOnExplorer")
          : t("proceedInWallet"),
      };
    }
    if (step === Steps.APPROVE) {
      return {
        title: t("approveAction", { symbol: symbol }),
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
  }, [
    step,
    approveExplorerUrl,
    symbol,
    swapTitle,
    t,
    wrapExplorerUrl,
    unwrapExplorerUrl,
    wSymbol,
    status,
  ]);
};

const TxError = ({ error }: { error?: any }) => {
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
  const { components } = useSpotContext();
  const t = useTranslations();
  const wrapTxHash = useSpotStore((s) => s.state.swapExecution?.wrapTxHash);
  const ErrorView = components.SubmitOrderErrorView;

  const content = (
    <SwapFlow.Failed
      error={<TxError error={error} />}
      footerLink={ORBS_TWAP_FAQ_URL}
      footerText={t("viewOnExplorer")}
    />
  );

  if (ErrorView) {
    return (
      <ErrorView wrapTxHash={wrapTxHash} error={error}>
        {content}
      </ErrorView>
    );
  }

  return content;
}

const Main = () => {
  const { components } = useSpotContext();
  const srcToken = useSpotStore((s) => s.state.swapExecution.srcToken);
  const dstToken = useSpotStore((s) => s.state.swapExecution.dstToken);
  const { reviewDetails } = useSubmitOrderPanelContext();
  const t = useTranslations();
  const isSubmitted = useSpotStore((s) =>
    Boolean(s.state.swapExecution?.status),
  );
  const order = useOrderInfo();

  const USD = components.USD;
  const MainView = components.SubmitOrderMainView;

  const content = (
    <>
      <SwapFlow.Main
        fromTitle={t("from")}
        toTitle={t("to")}
        inUsd={
          USD ? (
            <USD value={order.srcUsd} isLoading={false} />
          ) : (
            `$${order.srcUsd}`
          )
        }
        outUsd={
          USD ? (
            <USD value={order.dstUsd} isLoading={false} />
          ) : (
            `$${order.dstUsd}`
          )
        }
      />
      {!isSubmitted && (
        <div className="twap-create-order-bottom">
          <OrderDetails.Container>
            <div className="twap-create-order-details">
              <OrderDetails.Deadline
                deadline={order.deadline.value}
                label={order.deadline.label}
                tooltip={order.deadline.tooltip || ""}
              />
              <OrderDetails.Price
                srcToken={srcToken}
                price={order.triggerPrice.value}
                dstToken={dstToken}
                label={order.triggerPrice.label}
                tooltip={order.triggerPrice.tooltip}
                usd={order.triggerPrice.usd}
              />
               <OrderDetails.Price
                srcToken={srcToken}
                price={order.limitPrice.value}
                dstToken={dstToken}
                label={order.limitPrice.label}
                usd={order.limitPrice.usd}
                tooltip={order.limitPrice.tooltip}
              />

              <OrderDetails.MinDestAmount
                dstToken={dstToken}
                dstMinAmountOut={order.minDestAmountPerTrade.value}
                label={order.minDestAmountPerTrade.label}
                tooltip={order.minDestAmountPerTrade.tooltip || ""}
                usd={order.minDestAmountPerTrade.usd}
              />
              <OrderDetails.TradeSize
                tradeSize={order.sizePerTrade.value}
                trades={order.totalTrades.value}
                srcToken={srcToken}
                label={order.sizePerTrade.label}
                tooltip={order.sizePerTrade.tooltip}
              />
              <OrderDetails.TradesAmount
                trades={order.totalTrades.value}
                label={order.totalTrades.label}
                tooltip={order.totalTrades.tooltip}
              />
              <OrderDetails.TradeInterval
                chunks={order.totalTrades.value}
                fillDelayMillis={order.tradeInterval.value}
                label={order.tradeInterval.label}
                tooltip={order.tradeInterval.tooltip}
              />
              <OrderDetails.Recipient />
              {order.fees.amount && (
                <OrderDetails.Fees
                  fees={order.fees.amount}
                  label={order.fees.label}
                  usd={order.fees.usd}
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

  if (MainView) {
    return <MainView>{content}</MainView>;
  }

  return content;
};

const SubmitOrderPanel = (props: SubmitOrderPanelProps) => {
  const { status, stepIndex, totalSteps, parsedError } = useSpotStore(
    (s) => s.state.swapExecution,
  );

  const { components } = useSpotContext();
  const Spinner = components.Spinner;
  const SuccessIcon = components.SuccessIcon;
  const ErrorIcon = components.ErrorIcon;
  const TokenLogo = components.TokenLogo;

  const { srcToken, dstToken } = useSpotContext();
  const srcAmount = useSrcAmount().amountUI;
  const dstAmount = useDstTokenAmount().amountUI;
  const srcAmountF = useFormatNumber({ value: srcAmount, decimalScale: 2 });
  const outAmountF = useFormatNumber({ value: dstAmount, decimalScale: 2 });

  const inToken = useMemo(() => {
    return {
      symbol: srcToken?.symbol,
      logoUrl: srcToken?.logoUrl,
    };
  }, [srcToken]);
  const outToken = useMemo(() => {
    return {
      symbol: dstToken?.symbol,
      logoUrl: dstToken?.logoUrl,
    };
  }, [dstToken]);

  return (
    <SubmitOrderContextProvider {...props}>
      <SwapFlow
        inAmount={srcAmountF}
        outAmount={outAmountF}
        swapStatus={status}
        totalSteps={totalSteps}
        currentStep={useStep()}
        currentStepIndex={stepIndex}
        inToken={inToken}
        outToken={outToken}
        components={{
          SrcTokenLogo: TokenLogo && <TokenLogo token={srcToken} />,
          DstTokenLogo: TokenLogo && <TokenLogo token={dstToken} />,
          Failed: <Failed error={parsedError} />,
          Success: <SuccessContent />,
          Main: <Main />,
          Loader: Spinner,
          SuccessIcon: SuccessIcon,
          FailedIcon: ErrorIcon,
        }}
      />
    </SubmitOrderContextProvider>
  );
};

const SuccessContent = () => {
  const successTitle = useTitle();
  const { components } = useSpotContext();
  const newOrderId = useSpotStore((s) => s.state.swapExecution.orderId);
  const SuccessView = components.SubmitOrderSuccessView;

  const content = (
    <>
      <SwapFlow.Success title={successTitle} />
      <WrapMsg />
    </>
  );
  if (SuccessView) {
    return <SuccessView newOrderId={newOrderId}>{content}</SuccessView>;
  }
  return content;
};

export { SubmitOrderPanel };
