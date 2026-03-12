import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IoIosArrowDown } from "@react-icons/all-files/io/IoIosArrowDown";
import { OrderStatus } from "@orbs-network/spot-ui";
import { TokensDisplay } from "@orbs-network/swap-ui";
import { OrderDetails } from "../../components/order-details";
import { useSpotStore } from "../../store";
import { useCancelOrderMutation } from "../../hooks/use-cancel-order";
import { useDateFormat } from "../../hooks/helper-hooks";
import { useTranslations } from "../../hooks/use-translations";
import { useSpotContext } from "../../spot-context";
import { FormatNumber } from "../format-number";
import { FillsButton, FillsView } from "./order-fills";
import { SelectedOrder } from "../../types";
import { useSelectedOrder } from "../../hooks/use-history-order";


type ContextType = {
  order: SelectedOrder;
};

const Context = createContext({} as ContextType);

const useOrderContext = () => {
  return useContext(Context);
};

export const OrderPreview = () => {
  const selectedOrderID = useSpotStore((s) => s.state.selectedOrderID);
  const order = useSelectedOrder(selectedOrderID);

  const t = useTranslations();
  const [expanded, setExpanded] = useState<string | false>("panel1");
  const updateState = useSpotStore((s) => s.updateState);
  const showSelectedOrderFills = useSpotStore(
    (s) => s.state.showSelectedOrderFills,
  );
  const { components } = useSpotContext();
  const TokenLogo = components.TokenLogo;

  useEffect(() => {
    setExpanded("panel1");
    updateState({ showSelectedOrderFills: false });
  }, [order?.id.value]);

  const handleChange = (panel: string) => {
    setExpanded(expanded === panel ? false : panel);
  };

  if (!order) return null;

  const fills = order.fills ?? [];

  const content = showSelectedOrderFills ? (
    <FillsView order={order} />
  ) : (
    <>
      <TokensDisplay
        SrcTokenLogo={TokenLogo && <TokenLogo token={order.srcToken} />}
        DstTokenLogo={TokenLogo && <TokenLogo token={order.dstToken} />}
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
        <IoIosArrowDown
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
  return (
    <OrderDetails.TradeSize
      tradeSize={order.sizePerTrade.value as string}
      srcToken={order.srcToken}
      label={order.sizePerTrade.label}
      tooltip={order.sizePerTrade.tooltip as string}
      trades={order.totalTrades.value as number}
    />
  );
};

const ChunksAmount = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.TradesAmount
      trades={order.totalTrades.value as number}
      label={order.totalTrades.label}
      tooltip={order.totalTrades.tooltip as string}
    />
  );
};

const MinDestAmount = () => {
  const { order } = useOrderContext();

  return (
    <OrderDetails.MinDestAmount
      dstToken={order.dstToken}
      dstMinAmountOut={order.minDestAmountPerTrade.value as string}
      label={order.minDestAmountPerTrade.label}
      tooltip={order.minDestAmountPerTrade.tooltip as string}
    />
  );
};

const Expiry = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.Deadline
      deadline={order.deadline.value as number}
      label={order.deadline.label}
      tooltip={order.deadline.tooltip as string}
    />
  );
};

const TradeInterval = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.TradeInterval
      fillDelayMillis={order.tradeInterval.value as number}
      chunks={order.totalTrades.value as number}
      label={order.tradeInterval.label}
      tooltip={order.tradeInterval.tooltip as string}
    />
  );
};

const TriggerPrice = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.Price
      srcToken={order.srcToken}
      dstToken={order.dstToken}
      price={order.triggerPrice.value as string}
      label={order.triggerPrice.label}
      tooltip={order.triggerPrice.tooltip as string}
    />
  );
};

const OrderID = () => {
  const { order } = useOrderContext();

  return <OrderDetails.OrderID id={order.id.value || ""} />;
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
  if (!order.amountOutFilled.value) return null;
  return (
    <OrderDetails.DetailRow title={order.amountOutFilled.label}>
      <p>
        <FormatNumber value={order.amountOutFilled.value} />{" "}
        {order.dstToken?.symbol}
      </p>
    </OrderDetails.DetailRow>
  );
};

export const CancelOrderButton = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  const { mutateAsync: cancelOrder, isPending: isLoading } =
    useCancelOrderMutation();
  const { components } = useSpotContext();
  const Button = components.Button;

  const onCancelOrder = useCallback(async () => {
    return cancelOrder({ orders: [order.original] });
  }, [cancelOrder, order]);

  if (!order || order.original.status !== OrderStatus.Open) return null;
  if (!Button) return null;

  return (
    <Button
      loading={isLoading}
      onClick={onCancelOrder}
      disabled={isLoading}
      className="twap-cancel-order"
      text={t("cancelOrder")}
    >
      {t("cancelOrder")}
    </Button>
  );
};

const CreatedAt = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  const createdAtUi = useDateFormat(order.createdAt.value);
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
        <FormatNumber value={order.srcAmount.value} decimalScale={3} />{" "}
        {order.srcToken?.symbol}
      </p>
    </OrderDetails.DetailRow>
  );
};

const AmountInFilled = () => {
  const { order } = useOrderContext();

  return (
    <OrderDetails.DetailRow title={order.amountInFilled.label}>
      <p>
        <FormatNumber value={order.amountInFilled.value} decimalScale={3} />{" "}
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

  return (
    <OrderDetails.DetailRow title={order.progress.label}>
      <p>
        <FormatNumber value={order.progress.value || 0} decimalScale={2} />%
      </p>
    </OrderDetails.DetailRow>
  );
};

const LimitPrice = () => {
  const { order } = useOrderContext();
  const t = useTranslations();

  if (!order.limitPrice.value) return null;

  return (
    <OrderDetails.Price
      label={t("limitPrice") || ""}
      price={order.limitPrice.value as string}
      srcToken={order.srcToken}
      dstToken={order.dstToken}
      tooltip={order.limitPrice.tooltip}
    />
  );
};

const AvgExecutionPrice = () => {
  const { order } = useOrderContext();
  if (!order.executionPrice.value) return null;
  return (
    <OrderDetails.Price
      label={order.executionPrice.label}
      price={order.executionPrice.value}
      srcToken={order.srcToken}
      dstToken={order.dstToken}
    />
  );
};
