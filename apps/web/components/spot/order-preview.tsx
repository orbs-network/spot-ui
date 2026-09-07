/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ChevronDownIcon } from "lucide-react";
import { TokensDisplay } from "@orbs-network/swap-ui";
import {
  OrderStatus,
  useCancelOrder,
  useHistoryOrder,
  type Order,
} from "@orbs-network/spot-react";
import { useDateFormat } from "@/lib/hooks/common";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { FillsButton, FillsView } from "./order-fills";
import { useTranslations } from "@/lib/use-translations";
import { useOrdersPanelContext } from "./orders-context";
import { SpotTokenLogo } from "./components";
import { Button } from "../ui/button";

type ContextType = {
  order: NonNullable<ReturnType<typeof useHistoryOrder>>;
};

const Context = createContext({} as ContextType);

const useOrderContext = () => {
  return useContext(Context);
};

export const OrderPreview = () => {
  const {
    orders,
    selectedOrderKey,
    isDisplayingOrderFills,
    tokensByAddress,
  } = useOrdersPanelContext();
  const rawOrder = useMemo(
    () =>
      orders.all.find((order: Order) => order.historyKey === selectedOrderKey),
    [orders.all, selectedOrderKey],
  );
  const inputToken = rawOrder?.srcTokenAddress
    ? tokensByAddress.get(rawOrder.srcTokenAddress.toLowerCase())
    : undefined;
  const outputToken = rawOrder?.dstTokenAddress
    ? tokensByAddress.get(rawOrder.dstTokenAddress.toLowerCase())
    : undefined;
  const order = useHistoryOrder(rawOrder, inputToken, outputToken);

  const t = useTranslations();
  const [expanded, setExpanded] = useState<string | false>("panel1");

  useEffect(() => {
    setExpanded("panel1");
  }, [order?.id, isDisplayingOrderFills]);

  const handleChange = useCallback((panel: string) => {
    setExpanded((current) => (current === panel ? false : panel));
  }, []);
  const contextValue = useMemo(
    () => (order ? { order } : undefined),
    [order],
  );

  if (!order || !contextValue) return null;

  const fills = order.fills ?? [];

  const content = isDisplayingOrderFills ? (
    <FillsView order={order} />
  ) : (
    <>
      <TokensDisplay
        SrcTokenLogo={<SpotTokenLogo token={order.inputToken} />}
        DstTokenLogo={<SpotTokenLogo token={order.outputToken} />}
        fromTitle={t("from")}
        inToken={order.inputToken}
        toTitle={t("to")}
        outToken={order.outputToken}
      />

      <OrderDetails.Container>
        <div className="twap-orders__selected-order-bottom">
          <div className="twap-orders__selected-order-accordions">
            <AccordionContainer
              title={t("executionSummary")}
              onClick={() => handleChange("panel1")}
              expanded={expanded === "panel1"}
            >
              <ExecutionSummary />
            </AccordionContainer>
            <AccordionContainer
              title={t("orderInfo")}
              expanded={expanded === "panel2"}
              onClick={() => handleChange("panel2")}
            >
              <OrderInfo />
            </AccordionContainer>
            <FillsButton count={fills.length} />
          </div>
          <CancelOrderButton />
        </div>
      </OrderDetails.Container>
    </>
  );

  return (
    <Context.Provider value={contextValue}>
      <div
        className={`twap-orders__selected-order ${`twap-orders__selected-order-${order.original.status.toLowerCase()}`}`}
      >
        {content}
      </div>
    </Context.Provider>
  );
};

const AccordionContainer = ({
  expanded,
  onClick,
  children,
  title,
}: {
  expanded: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
}) => {
  return (
    <div className="twap-orders__selected-order-accordion">
      <div
        onClick={onClick}
        className="twap-orders__selected-order-accordion-trigger"
      >
        <p>{title}</p>
        <ChevronDownIcon
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </div>
      {expanded && (
        <div className="twap-orders__selected-order-accordion-details">
          {children}
        </div>
      )}
    </div>
  );
};

const OrderInfo = () => {
  return (
    <OrderDetails>
      <OrderID />
      <CreatedAt />
      <Expiry />
      <AmountIn />
      <ChunkSize />
      <ChunksAmount />
      <MinOutputAmount />
      <TradeInterval />
      <TriggerPrice />
      <LimitPrice />
      <OrderDetails.Recipient />
    </OrderDetails>
  );
};

const ChunkSize = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.TradeSize
      tradeSize={order.inputAmountPerTrade.ui}
      inputToken={order.inputToken}
      label={t("individualTradeSize")}
      tooltip={t("tradeSizeTooltip")}
      trades={order.totalTrades}
    />
  );
};

const ChunksAmount = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.TradesAmount
      trades={order.totalTrades}
      label={t("numberOfTrades")}
      tooltip={t("totalTradesTooltip")}
    />
  );
};

const MinOutputAmount = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.MinOutputAmount
      outputToken={order.outputToken}
      minOutputAmount={order.minOutputAmountPerTrade.ui}
      label={t("minReceivedPerTrade")}
      tooltip={t("minDstAmountTooltip")}
    />
  );
};

const Expiry = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.Deadline
      deadline={order.deadline}
      label={t("expirationLabel")}
      tooltip={t("expirationTooltip")}
    />
  );
};

const TradeInterval = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.TradeInterval
      fillDelayMillis={order.tradeInterval}
      chunks={order.totalTrades}
      label={t("tradeIntervalLabel")}
      tooltip={t("tradeIntervalTooltip")}
    />
  );
};

const TriggerPrice = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.Price
      inputToken={order.inputToken}
      outputToken={order.outputToken}
      price={order.triggerPrice.ui}
      label={t("triggerPrice")}
      tooltip={t("triggerPriceTooltip")}
    />
  );
};

const OrderID = () => {
  const { order } = useOrderContext();

  return <OrderDetails.OrderID id={order.id || ""} />;
};

const ExecutionSummary = () => {
  return (
    <OrderDetails>
      <OrderStatusComponent />
      <AmountInFilled />
      <AmountOutFilled />
      <Progress />
      <AvgExecutionPrice />
    </OrderDetails>
  );
};

const AmountOutFilled = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  if (!order.outputAmountFilled.raw) return null;
  return (
    <OrderDetails.DetailRow title={t("amountReceived")}>
      <p>
        <FormatNumber value={order.outputAmountFilled.ui} />{" "}
        {order.outputToken?.symbol}
      </p>
    </OrderDetails.DetailRow>
  );
};

export const CancelOrderButton = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  const { cancelOrder, disabled, isLoading } =
    useCancelOrder(order.original);

  if (!order || order.original.status !== OrderStatus.Open) return null;

  return (
    <Button
      isLoading={isLoading}
      onClick={cancelOrder}
      disabled={disabled || isLoading}
      className="twap-cancel-order"
    >
      {t("cancelOrder")}
    </Button>
  );
};

const CreatedAt = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  const createdAtUi = useDateFormat(order.createdAt);
  return (
    <OrderDetails.DetailRow title={t("createdAt") || ""}>
      <p>{createdAtUi}</p>
    </OrderDetails.DetailRow>
  );
};

const AmountIn = () => {
  const { order } = useOrderContext();
  const t = useTranslations();

  return (
    <OrderDetails.DetailRow title={t("amountOut") || ""}>
      <p>
        <FormatNumber value={order.inputAmount.ui} decimalScale={3} />{" "}
        {order.inputToken?.symbol}
      </p>
    </OrderDetails.DetailRow>
  );
};

const AmountInFilled = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.DetailRow title={t("amountOut")}>
      <p>
        <FormatNumber value={order.inputAmountFilled.ui} decimalScale={3} />{" "}
        {order.inputToken?.symbol}
      </p>
    </OrderDetails.DetailRow>
  );
};

const useOrderStatusText = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return useMemo(() => {
    switch (order.original.status) {
      case OrderStatus.Open:
        return t("Open") || "";
      case OrderStatus.Completed:
        return t("Completed") || "";
      case OrderStatus.Expired:
        return t("Expired") || "";
      case OrderStatus.Cancelled:
        return t("Cancelled") || "";

        break;

      default:
        break;
    }
  }, [order.original.status, t]);
};

const OrderStatusComponent = () => {
  const t = useTranslations();
  const text = useOrderStatusText();

  return (
    <OrderDetails.DetailRow title={t("status") || ""}>
      <p>{text}</p>
    </OrderDetails.DetailRow>
  );
};

const Progress = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.DetailRow title={t("progress")}>
      <p>
        <FormatNumber value={order.progress || 0} decimalScale={2} />%
      </p>
    </OrderDetails.DetailRow>
  );
};

const LimitPrice = () => {
  const { order } = useOrderContext();
  const t = useTranslations();

  if (!order.limitPrice.ui) return null;

  return (
    <OrderDetails.Price
      label={t("limitPrice") || ""}
      price={order.limitPrice.ui}
      inputToken={order.inputToken}
      outputToken={order.outputToken}
      tooltip={t("limitPriceTooltip")}
    />
  );
};

const AvgExecutionPrice = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  if (!order.executionPrice.raw) return null;
  return (
    <OrderDetails.Price
      label={t(
        order.original.totalTradesAmount === 1
          ? "finalExecutionPrice"
          : "averageExecutionPrice",
      )}
      price={order.executionPrice.ui}
      inputToken={order.inputToken}
      outputToken={order.outputToken}
    />
  );
};
