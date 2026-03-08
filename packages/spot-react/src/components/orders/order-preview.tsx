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
import { IoIosArrowForward } from "@react-icons/all-files/io/IoIosArrowForward";
import { Virtuoso } from "react-virtuoso";
import { OrderStatus } from "@orbs-network/spot-ui";
import { TokensDisplay } from "@orbs-network/swap-ui";
import { OrderDetails } from "../../components/order-details";
import { useSpotStore } from "../../store";
import { useCancelOrderMutation } from "../../hooks/use-cancel-order";
import {
  useAmountUi,
  useDateFormat,
  useExplorerLink,
} from "../../hooks/helper-hooks";
import { useHistoryOrder } from "../../hooks/use-history-order";
import { useTranslations } from "../../hooks/use-translations";
import { useSpotContext } from "../../spot-context";
import { makeElipsisAddress } from "../../utils";
import { FormatNumber } from "../format-number";
import TokenLogo from "../TokenLogo";
import { Token } from "../../types";
import { HiArrowRight } from "@react-icons/all-files/hi/HiArrowRight";

type Order = NonNullable<ReturnType<typeof useHistoryOrder>>;

type ContextType = {
  order: Order;
};

const Context = createContext({} as ContextType);

const useOrderContext = () => {
  return useContext(Context);
};

const FillsTokensDisplayToken = ({ token }: { token?: Token }) => {
  const { components } = useSpotContext();

  return (
    <div className="twap-orders__selected-order-fills-token">
      {components.TokenLogo ? (
        <components.TokenLogo token={token} />
      ) : (
        <TokenLogo logo={token?.logoUrl} />
      )}
      <p className="twap-orders__selected-order-fills-token-symbol">{token?.symbol}</p>
    </div>
  );
};

const FillsTokensDisplay = () => {
  const selectedOrderID = useSpotStore((s) => s.state.selectedOrderID);
  const order = useHistoryOrder(selectedOrderID);

  return (
    <div className="twap-orders__selected-order-fills-tokens">
      <FillsTokensDisplayToken token={order.srcToken} />
      <span className="twap-orders__selected-order-fills-token-separator">
        <HiArrowRight />
      </span>
      <FillsTokensDisplayToken token={order.dstToken} />
    </div>
  );
};

export const OrderPreview = () => {
  const selectedOrderID = useSpotStore((s) => s.state.selectedOrderID);
  const order = useHistoryOrder(selectedOrderID);

  const t = useTranslations();
  const [expanded, setExpanded] = useState<string | false>("panel1");
  const updateState = useSpotStore((s) => s.updateState);
  const showSelectedOrderFills = useSpotStore((s) => s.state.showSelectedOrderFills);
  const { components } = useSpotContext();
  const TokenLogo = components.TokenLogo;

  useEffect(() => {
    setExpanded("panel1");
    updateState({ showSelectedOrderFills: false });
  }, [order.id.value]);

  const handleChange = (panel: string) => {
    setExpanded(expanded === panel ? false : panel);
  };

  if (!order) return null;

  const fills = order.original?.fills ?? [];

  return (
    <Context.Provider value={{ order }}>
      <div className="twap-orders__selected-order">
        {showSelectedOrderFills ? (
          <FillsView />
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
                    title={t("excecutionSummary")}
                    onClick={() => handleChange("panel1")}
                    expanded={expanded === "panel1"}
                  >
                    <ExcecutionSummary />
                  </AccordionContainer>
                  <AccordionContainer
                    title={t("orderInfo")}
                    expanded={expanded === "panel2"}
                    onClick={() => handleChange("panel2")}
                  >
                    <OrderInfo />
                  </AccordionContainer>
                  <FillsButton
                    count={fills.length}
                    onClick={() => updateState({ showSelectedOrderFills: true })}
                  />
                </div>
                <CancelOrderButton />
              </div>
            </OrderDetails.Container>
          </>
        )}
      </div>
    </Context.Provider>
  );
};

const FillsButton = ({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) => {
  const t = useTranslations();
  return (
    <div className="twap-orders__selected-order-accordion">
      <div
        onClick={onClick}
        className="twap-orders__selected-order-accordion-trigger"
      >
        <p>
          {t("orderFills")} ({count})
        </p>
        <IoIosArrowForward />
      </div>
    </div>
  );
};

const FillsView = () => {
  const { order } = useOrderContext();
  const t = useTranslations();
  const fills = order.original?.fills ?? [];

  return (
    <div className="twap-orders__selected-order-fills">
      <FillsTokensDisplay />
    
      {fills.length === 0 ? (
        <p className="twap-orders__selected-order-fills-empty">{t("noFills")}</p>
      ) : (
        <div className="twap-orders__selected-order-fills-list">
          <Virtuoso
            style={{ height: "100%" }}
            totalCount={fills.length}
            itemContent={(index) => {
              const fill = fills[index];
              if (!fill) return null;
              return (
                <FillItem
                  fill={fill}
                  index={index + 1}
                  srcToken={order.srcToken}
                  dstToken={order.dstToken}
                />
              );
            }}
          />
        </div>
      )}
    </div>
  );
};

const FillItem = ({
  fill,
  index,
  srcToken,
  dstToken,
}: {
  fill: {
    inAmount: string;
    outAmount: string;
    timestamp: number;
    txHash: string;
  };
  index: number;
  srcToken?: { symbol?: string; decimals?: number };
  dstToken?: { symbol?: string; decimals?: number };
}) => {
  const inAmountUi = useAmountUi(srcToken?.decimals, fill.inAmount);
  const outAmountUi = useAmountUi(dstToken?.decimals, fill.outAmount);
  const dateUi = useDateFormat(
    fill.timestamp < 1e12 ? fill.timestamp * 1000 : fill.timestamp,
  );
  const txUrl = useExplorerLink(fill.txHash);

  return (
    <div className="twap-fills-view__item">
      <div className="twap-fills-view__item-top">
        <span className="twap-fills-view__item-index">#{index}</span>
        <span className="twap-fills-view__item-date">{dateUi}</span>
      </div>
      <div className="twap-fills-view__item-amounts">
        <div className="twap-fills-view__item-amount">
          <span className="twap-fills-view__item-label">In</span>
          <span className="twap-fills-view__item-value">
            <FormatNumber value={inAmountUi} /> {srcToken?.symbol ?? ""}
          </span>
        </div>
        <span className="twap-fills-view__item-arrow">→</span>
        <div className="twap-fills-view__item-amount">
          <span className="twap-fills-view__item-label">Out</span>
          <span className="twap-fills-view__item-value">
            <FormatNumber value={outAmountUi} /> {dstToken?.symbol ?? ""}
          </span>
        </div>
      </div>
      {fill.txHash && (
        <div className="twap-fills-view__item-tx">
          {txUrl ? (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="twap-fills-view__tx-link"
              title={fill.txHash}
            >
              {makeElipsisAddress(fill.txHash)}
            </a>
          ) : (
            <span className="twap-fills-view__tx-text">
              {makeElipsisAddress(fill.txHash)}
            </span>
          )}
        </div>
      )}
    </div>
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
      tradeSize={order.sizePerTrade.value}
      srcToken={order.srcToken}
      label={order.sizePerTrade.label}
      tooltip={order.sizePerTrade.tooltip}
      trades={order.totalTrades.value}
    />
  );
};

const ChunksAmount = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.TradesAmount
      trades={order.totalTrades.value}
      label={order.totalTrades.label}
      tooltip={order.totalTrades.tooltip}
    />
  );
};

const MinDestAmount = () => {
  const { order } = useOrderContext();

  return (
    <OrderDetails.MinDestAmount
      dstToken={order.dstToken}
      dstMinAmountOut={order.minDestAmountPerTrade.value}
      label={order.minDestAmountPerTrade.label}
      tooltip={order.minDestAmountPerTrade.tooltip}
    />
  );
};

const Expiry = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.Deadline
      deadline={order.deadline.value}
      label={order.deadline.label}
      tooltip={order.deadline.tooltip}
    />
  );
};

const TradeInterval = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.TradeInterval
      fillDelayMillis={order.tradeInterval.value}
      chunks={order.totalTrades.value}
      label={order.tradeInterval.label}
      tooltip={order.tradeInterval.tooltip}
    />
  );
};

const TriggerPrice = () => {
  const { order } = useOrderContext();
  return (
    <OrderDetails.Price
      srcToken={order.srcToken}
      dstToken={order.dstToken}
      price={order.triggerPrice.value}
      label={order.triggerPrice.label}
      tooltip={order.triggerPrice.tooltip}
    />
  );
};

const OrderID = () => {
  const { order } = useOrderContext();

  return <OrderDetails.OrderID id={order.id.value || ""} />;
};

const ExcecutionSummary = () => {
  return (
    <OrderDetails>
      <OrderStatusComponent />
      <AmountInFilled />
      <AmountOutFilled />
      <Progress />
      <AvgExcecutionPrice />
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
      case OrderStatus.Canceled:
        return t("Canceled") || "";

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
      price={order.limitPrice.value}
      srcToken={order.srcToken}
      dstToken={order.dstToken}
      tooltip={order.limitPrice.tooltip}
    />
  );
};

const AvgExcecutionPrice = () => {
  const { order } = useOrderContext();
  if (!order.excecutionPrice.value) return null;
  return (
    <OrderDetails.Price
      label={order.excecutionPrice.label}
      price={order.excecutionPrice.value}
      srcToken={order.srcToken}
      dstToken={order.dstToken}
    />
  );
};
