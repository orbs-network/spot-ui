"use client";
import { memo } from "react";
import { OrderPreview } from "./order-preview";
import { OrdersList } from "./orders-list";
import { useOrdersPanelContext } from "./orders-context";

export const OrdersView = memo(function OrdersView() {
  const { selectedOrderKey } = useOrdersPanelContext();
  const isPreviewOrder = selectedOrderKey !== undefined;
  return (
    <div
      className={`twap-orders ${isPreviewOrder ? "twap-orders__show-selected" : ""}`}
    >
      {isPreviewOrder ? <OrderPreview /> : <OrdersList />}
    </div>
  );
});
