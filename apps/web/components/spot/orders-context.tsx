"use client";
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  useOrders,
  type Order,
  type Token,
} from "@orbs-network/spot-react";

export type OrdersPanelData = {
  orders: NonNullable<ReturnType<typeof useOrders>["data"]>;
  isLoading: boolean;
  filteredOrders: Order[];
  tokensByAddress: ReadonlyMap<string, Token>;
  selectedOrderKey?: string;
  onDisplayOrder: (historyKey?: string) => void;
  isDisplayingOrderFills: boolean;
  onHideOrderFills: () => void;
  onShowOrderFills: () => void;
};

const OrdersContext = createContext({} as OrdersPanelData);

export const useOrdersUIState = () => {
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | undefined>();
  const [isDisplayingOrderFills, setIsDisplayingOrderFills] = useState(false);

  const onDisplayOrder = useCallback((historyKey?: string) => {
    setSelectedOrderKey(historyKey);
    if (!historyKey) setIsDisplayingOrderFills(false);
  }, []);

  const onHideOrderFills = useCallback(
    () => setIsDisplayingOrderFills(false),
    [],
  );
  const onShowOrderFills = useCallback(
    () => setIsDisplayingOrderFills(true),
    [],
  );

  return useMemo(
    () => ({
      selectedOrderKey,
      onDisplayOrder,
      isDisplayingOrderFills,
      onHideOrderFills,
      onShowOrderFills,
    }),
    [
      isDisplayingOrderFills,
      onDisplayOrder,
      onHideOrderFills,
      onShowOrderFills,
      selectedOrderKey,
    ],
  );
};

export const OrdersProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: OrdersPanelData;
}) => (
  <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
);

export const useOrdersPanelContext = () => useContext(OrdersContext);
