/* eslint-disable react-hooks/preserve-manual-memoization */
"use client";
import { ArrowRightIcon } from "lucide-react";
import { Order } from "@orbs-network/spot-react";
import { useDateFormat } from "@/lib/hooks/common";
import * as React from "react";
import { Virtuoso } from "react-virtuoso";
import { useTranslations } from "@/lib/use-translations";
import { useSpotToken } from "@/lib/hooks/spot-hooks";
import { SpotTokenLogo } from "./components";
import { useOrdersPanelContext } from "./orders-context";
import { getOrderTitle } from "@/lib/utils";

const ListLoader = () => {
  return <div className="twap-orders__loader">{<p>Loading...</p>}</div>;
};

export const OrdersList = () => {
  const { isLoading, filteredOrders: ordersToDisplay } = useOrdersPanelContext();

  return (
    <>
      {isLoading ? (
        <ListLoader />
      ) : !ordersToDisplay?.length ? (
        <EmptyList />
      ) : (
        <div className="twap-orders__list">
          <Virtuoso
            style={{ height: "100%" }}
            data={ordersToDisplay}
            itemContent={(index, order) => (
              <ListOrder
                key={index}
                order={order}
              />
            )}
          />
        </div>
      )}
    </>
  );
};

const ListOrder = ({ order }: { order: Order }) => {
  const { onDisplayOrder } = useOrdersPanelContext();

  const onShowOrder = React.useCallback(() => {
    onDisplayOrder(order?.id);
  }, [onDisplayOrder, order?.id]);


  return (
    <div
      className={`twap-orders__list-item twap-orders__list-item-${order.status}`}
      onClick={onShowOrder}
    >
      <div className="twap-orders__list-item-content">
        <ListItemHeader order={order} />
        <LinearProgressWithLabel value={order.progress || 0} />
        <div className="twap-orders__list-item-tokens">
          <TokenDisplay address={order.srcTokenAddress} />
          <ArrowRightIcon className="twap-orders__list-item-tokens-arrow size-4" />
          <TokenDisplay address={order.dstTokenAddress} />
        </div>
      </div>
    </div>
  );
};

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

const TokenDisplay = (props: { address?: string }) => {
  const token = useSpotToken(props.address);

  return (
    <div className="twap-orders__list-item-token">
      {!token ? (
        <div />
      ) : (
        <>
          <div className="twap-orders__list-item-token-logo">
            <SpotTokenLogo token={token} />
          </div>
          <p className="twap-orders__list-item-token-symbol">{token?.symbol}</p>
        </>
      )}
    </div>
  );
};

function LinearProgressWithLabel(props: { value: number }) {
  return (
    <div className="twap-orders__list-item-progress">
      <div className="twap-orders__list-item-progress-bar">
        <div className="twap-orders__list-item-progress-bar-filled" style={{ width: `${props.value}%` }} />
      </div>
      <div className="twap-orders__list-item-token-progress-label">
        <p>{`${Math.round(props.value)}%`}</p>
      </div>
    </div>
  );
}
