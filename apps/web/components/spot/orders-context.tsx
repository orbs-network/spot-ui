"use client";
import { createContext, useContext, useCallback, useState } from "react";
import { useSpot, type Order } from "@orbs-network/spot-react";

export type OrdersPanelData = ReturnType<typeof useSpot>["orderHistory"] & {
  filteredOrders: Order[];
  selectedOrderID?: string;
  onDisplayOrder: (id?: string) => void;
  isDisplayingOrderFills: boolean;
  onHideOrderFills: () => void;
  onShowOrderFills: () => void;
  orderIdsToCancel: string[];
  cancelOrdersMode: boolean;
  onToggleCancelOrderId: (id: string) => void;
};

const OrdersContext = createContext({} as OrdersPanelData);

export const useOrdersUIState = () => {
  const [selectedOrderID, setSelectedOrderID] = useState<string | undefined>();
  const [isDisplayingOrderFills, setIsDisplayingOrderFills] = useState(false);
  const [orderIdsToCancel, setOrderIdsToCancel] = useState<string[]>([]);
  const [cancelOrdersMode, setCancelOrdersMode] = useState(false);

  const onDisplayOrder = useCallback((id?: string) => {
    setSelectedOrderID(id);
    if (!id) setIsDisplayingOrderFills(false);
  }, []);

  const onHideOrderFills = useCallback(() => setIsDisplayingOrderFills(false), []);
  const onShowOrderFills = useCallback(() => setIsDisplayingOrderFills(true), []);

  const onToggleCancelOrderId = useCallback((id: string) => {
    setOrderIdsToCancel((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  return {
    selectedOrderID,
    onDisplayOrder,
    isDisplayingOrderFills,
    onHideOrderFills,
    onShowOrderFills,
    orderIdsToCancel,
    cancelOrdersMode,
    onToggleCancelOrderId,
  };
};

export const OrdersProvider = ({ children, value }: { children: React.ReactNode; value: OrdersPanelData }) => {
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export const useOrdersPanelContext = () => useContext(OrdersContext);
