"use client";
import { ArrowRightIcon } from "lucide-react";
import type { Order, Token } from "@orbs-network/spot-react";
import { useDateFormat } from "@/lib/hooks/common";
import * as React from "react";
import { Virtuoso } from "react-virtuoso";
import { useTranslations } from "@/lib/use-translations";
import { SpotTokenLogo } from "./components";
import { useOrdersPanelContext } from "./orders-context";
import { getOrderTitle } from "@/lib/utils";
import { Button } from "../ui/button";

const VIRTUAL_LIST_STYLE = { height: "100%" } as const;
const getOrderKey = (_index: number, order: Order) => order.historyKey;

const ListLoader = () => {
  return (
    <div className="twap-orders__loader">
      <p>Loading...</p>
    </div>
  );
};

export const OrdersList = () => {
  const {
    isLoading,
    error,
    isFetching,
    refetch,
    filteredOrders: ordersToDisplay,
    onDisplayOrder,
    tokensByAddress,
  } = useOrdersPanelContext();
  const renderOrder = React.useCallback(
    (_index: number, order: Order) => (
      <ListOrder
        order={order}
        inputToken={tokensByAddress.get(order.srcTokenAddress.toLowerCase())}
        outputToken={tokensByAddress.get(order.dstTokenAddress.toLowerCase())}
        onDisplayOrder={onDisplayOrder}
      />
    ),
    [onDisplayOrder, tokensByAddress],
  );

  return (
    <>
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 py-4 text-sm">
          <p>Unable to load order history. Please try again.</p>
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}
      {isLoading ? (
        <ListLoader />
      ) : !ordersToDisplay?.length ? (
        error ? null : <EmptyList />
      ) : (
        <div className="twap-orders__list">
          <Virtuoso
            style={VIRTUAL_LIST_STYLE}
            data={ordersToDisplay}
            computeItemKey={getOrderKey}
            itemContent={renderOrder}
          />
        </div>
      )}
    </>
  );
};

const ListOrder = React.memo(function ListOrder({
  order,
  inputToken,
  outputToken,
  onDisplayOrder,
}: {
  order: Order;
  inputToken?: Token;
  outputToken?: Token;
  onDisplayOrder: (historyKey?: string) => void;
}) {
  const onShowOrder = React.useCallback(() => {
    onDisplayOrder(order.historyKey);
  }, [onDisplayOrder, order.historyKey]);

  return (
    <div
      className={`twap-orders__list-item twap-orders__list-item-${order.status}`}
      onClick={onShowOrder}
    >
      <div className="twap-orders__list-item-content">
        <ListItemHeader order={order} />
        <LinearProgressWithLabel value={order.progress || 0} />
        <div className="twap-orders__list-item-tokens">
          <TokenDisplay token={inputToken} />
          <ArrowRightIcon className="twap-orders__list-item-tokens-arrow size-4" />
          <TokenDisplay token={outputToken} />
        </div>
      </div>
    </div>
  );
});

const EmptyList = () => {
  const t = useTranslations();

  return (
    <div className="twap-orders__list-empty">
      <p>{t("noOrders", { status: "" })}</p>
    </div>
  );
};

const ListItemHeader = ({ order }: { order: Order }) => {
  const status = order && order.status;
  const name = getOrderTitle(order.type);
  const formattedDate = useDateFormat(order.createdAt);

  return (
    <div className="twap-orders__list-item-header">
      <p className="twap-orders__list-item-header-title">
        {name} <span>{`(${formattedDate})`}</span>
      </p>
      <p className="twap-orders__list-item-header-status">{status}</p>
    </div>
  );
};

const TokenDisplay = ({ token }: { token?: Token }) => {
  return (
    <div className="twap-orders__list-item-token">
      {!token ? (
        <div />
      ) : (
        <>
          <div className="twap-orders__list-item-token-logo">
            <SpotTokenLogo token={token} />
          </div>
          <p className="twap-orders__list-item-token-symbol">{token.symbol}</p>
        </>
      )}
    </div>
  );
};

function LinearProgressWithLabel(props: { value: number }) {
  return (
    <div className="twap-orders__list-item-progress">
      <div className="twap-orders__list-item-progress-bar">
        <div
          className="twap-orders__list-item-progress-bar-filled"
          style={{ width: `${props.value}%` }}
        />
      </div>
      <div className="twap-orders__list-item-token-progress-label">
        <p>{`${Math.round(props.value)}%`}</p>
      </div>
    </div>
  );
}
