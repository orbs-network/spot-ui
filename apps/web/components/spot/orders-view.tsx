"use client";
import { OrderPreview } from "./order-preview";
import { OrdersList } from "./orders-list";
import { useOrdersPanelContext } from "./orders-context";

export const OrdersView = () => {
  const { selectedOrderID } = useOrdersPanelContext();
  const isPreviewOrder = selectedOrderID !== undefined;
  return (
    <div className={`twap-orders ${selectedOrderID !== undefined ? "twap-orders__show-selected" : ""}`}>
      {isPreviewOrder ? <OrderPreview /> : <OrdersList />}
    </div>
  );
};
