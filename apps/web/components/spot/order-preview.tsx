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
  useDerivedHistoryOrder,
  useSpot,
  type Order,
} from "@orbs-network/spot-react";
import { useDateFormat } from "@/lib/hooks/common";
import { FormatNumber } from "./format-number";
import { OrderDetails } from "./order-details";
import { useSpotToken } from "@/lib/hooks/spot-hooks";
import { FillsButton, FillsView } from "./order-fills";
import { useTranslations } from "@/lib/use-translations";
import { useOrdersPanelContext } from "./orders-context";
import { SpotTokenLogo } from "./components";
import { Button } from "../ui/button";

type ContextType = {
  order: NonNullable<ReturnType<typeof useDerivedHistoryOrder>>;
};

const Context = createContext({} as ContextType);

const useOrderContext = () => {
  return useContext(Context);
};

export const OrderPreview = () => {
  const { selectedOrderID, isDisplayingOrderFills, onHideOrderFills } = useOrdersPanelContext();
  const { orders } = useSpot().orderHistoryPanel;
  const rawOrder = useMemo(
    () => orders.all.find((o: Order) => o.id === selectedOrderID),
    [orders, selectedOrderID],
  );
  const srcToken = useSpotToken(rawOrder?.srcTokenAddress);
  const dstToken = useSpotToken(rawOrder?.dstTokenAddress);
  const order = useDerivedHistoryOrder(rawOrder!, srcToken, dstToken);

  const t = useTranslations();
  const [expanded, setExpanded] = useState<string | false>("panel1");

  useEffect(() => {
    setExpanded("panel1");
    if (isDisplayingOrderFills) onHideOrderFills();
  }, [order?.id]);

  const handleChange = (panel: string) => {
    setExpanded(expanded === panel ? false : panel);
  };

  if (!order) return null;

  const fills = order.fills ?? [];

  const content = isDisplayingOrderFills ? (
    <FillsView order={order} />
  ) : (
    <>
      <TokensDisplay
        SrcTokenLogo={<SpotTokenLogo token={order.srcToken} />}
        DstTokenLogo={<SpotTokenLogo token={order.dstToken} />}
        fromTitle={t("from")}
        inToken={order.srcToken}
        toTitle={t("to")}
        outToken={order.dstToken}
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
    <Context.Provider value={{ order }}>
      <div className={`twap-orders__selected-order ${`twap-orders__selected-order-${order.original.status.toLowerCase()}`}`}>{content}</div>
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
      <MinDestAmount />
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
      tradeSize={order.sizePerTradeUI}
      srcToken={order.srcToken}
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

const MinDestAmount = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  return (
    <OrderDetails.MinDestAmount
      dstToken={order.dstToken}
      dstMinAmountOut={order.minDestAmountPerTradeUI}
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
      srcToken={order.srcToken}
      dstToken={order.dstToken}
      price={order.triggerPriceUI}
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
  if (!order.amountOutFilled) return null;
  return (
    <OrderDetails.DetailRow title={t("amountReceived")}>
      <p>
        <FormatNumber value={order.amountOutFilled} />{" "}
        {order.dstToken?.symbol}
      </p>
    </OrderDetails.DetailRow>
  );
};

export const CancelOrderButton = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  const { mutateAsync: cancelOrder, isPending: isLoading } =
    useSpot().mutations.cancelOrder;

  const onCancelOrder = useCallback(async () => {
    return cancelOrder({ orders: [order.original] });
  }, [cancelOrder, order]);

  if (!order || order.original.status !== OrderStatus.Open) return null;

  return (
    <Button
      isLoading={isLoading}
      onClick={onCancelOrder}
      disabled={isLoading}
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
        <FormatNumber value={order.srcAmountUI} decimalScale={3} />{" "}
        {order.srcToken?.symbol}
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
        <FormatNumber value={order.amountInFilled} decimalScale={3} />{" "}
        {order.srcToken?.symbol}
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

  if (!order.limitPriceUI) return null;

  return (
    <OrderDetails.Price
      label={t("limitPrice") || ""}
      price={order.limitPriceUI}
      srcToken={order.srcToken}
      dstToken={order.dstToken}
      tooltip={t("limitPriceTooltip")}
    />
  );
};

const AvgExecutionPrice = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  if (!order.executionPrice) return null;
  return (
    <OrderDetails.Price
      label={t(order.original.totalTradesAmount === 1 ? "finalExecutionPrice" : "averageExecutionPrice")}
      price={order.executionPrice}
      srcToken={order.srcToken}
      dstToken={order.dstToken}
    />
  );
};
