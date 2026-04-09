import {
  OrderFilter,
  OrderStatus,
  OrderType,
  SPOT_VERSION,
  useSpot,
  type Order,
} from "@orbs-network/spot-react";
import { OrdersView } from "./orders-view";
import { OrdersProvider, useOrdersUIState } from "./orders-context";
import { useTranslations } from "@/lib/use-translations";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ArrowLeftIcon, HistoryIcon, LinkIcon, TrashIcon } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { DialogHeader } from "../ui/dialog";
import { SpotSelectMenu } from "./components";
import { Spinner } from "../ui/spinner";

const filterAndSortOrders = (orders: Order[], filter: OrderFilter): Order[] => {
  const filtered =
    filter === OrderFilter.All
      ? orders
      : orders.filter((o) => o.status === (filter as unknown as OrderStatus));
  return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
};

const getOrderFilterText = (filter: OrderFilter): string => {
  switch (filter) {
    case OrderFilter.All:
      return "All";
    case OrderFilter.Open:
      return "Open";
    case OrderFilter.Completed:
      return "Completed";
    case OrderFilter.Cancelled:
      return "Cancelled";
    case OrderFilter.Expired:
      return "Expired";
    default:
      return filter;
  }
};

const getHistoryOrderTitle = (order?: Order): string => {
  if (!order) return "";
  switch (order.type) {
    case OrderType.LIMIT:
      return "Limit";
    case OrderType.TWAP_LIMIT:
      return "TWAP Limit";
    case OrderType.TWAP_MARKET:
      return "TWAP Market";
    case OrderType.TAKE_PROFIT:
      return "Take Profit";
    case OrderType.STOP_LOSS_LIMIT:
      return "Stop Loss Limit";
    case OrderType.STOP_LOSS_MARKET:
      return "Stop Loss Market";
    default:
      return order.type || "";
  }
};

const getSinkUrl = (orderId: string) => {
  if (Number(SPOT_VERSION) >= 2) {
    return `https://order-sink-v2.orbs.network/?order=${orderId}`;
  }
  return `https://order-sink-dev.orbs.network/?order=${orderId}`;
};

const useOrderFilters = () => {
  return useMemo(() => {
    return Object.values(OrderFilter).map((it) => ({
      text: getOrderFilterText(it),
      value: it,
    }));
  }, []);
};

export const SpotsOrders = () => {
  const spot = useSpot();
  const panelData = spot.orderHistory;
  const { orders } = panelData;
  const uiState = useOrdersUIState();
  const {
    selectedOrderID,
    onDisplayOrder,
    isDisplayingOrderFills,
    onHideOrderFills,
  } = uiState;
  const { mutateAsync: cancelOrders, isPending: isCancelOrderLoading } =
    spot.mutations.cancelOrder;
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<OrderFilter>(
    OrderFilter.All,
  );

  const orderFilters = useOrderFilters();
  const filteredOrders = useMemo(
    () => filterAndSortOrders(orders.all, selectedFilter),
    [orders, selectedFilter],
  );
  const openOrders = useMemo(
    () => filterAndSortOrders(orders.all, OrderFilter.Open),
    [orders],
  );

  const selectedRawOrder = useMemo(
    () => orders.all.find((o: Order) => o.id === selectedOrderID),
    [orders, selectedOrderID],
  );
  const selectedOrderTitle = getHistoryOrderTitle(selectedRawOrder);

  const selectedOrder = useMemo(() => {
    return selectedOrderID
      ? { title: selectedOrderTitle, id: selectedRawOrder?.id }
      : undefined;
  }, [selectedOrderID, selectedOrderTitle, selectedRawOrder?.id]);

  const selectedFilterItem = useMemo(() => {
    return (
      orderFilters.find((item) => item.value === selectedFilter) ||
      orderFilters[0]
    );
  }, [orderFilters, selectedFilter]);

  const onCancelAllOpenOrders = useCallback(
    () => cancelOrders({ orders: openOrders }),
    [cancelOrders, openOrders],
  );

  const title = useMemo(() => {
    if (isDisplayingOrderFills) {
      return `${t(selectedOrder?.title || "")} order fills`;
    }
    return selectedOrder?.title
      ? t(selectedOrder.title)
      : `Orders (${orders.all.length})`;
  }, [isDisplayingOrderFills, selectedOrder, orders.all.length, t]);

  const onBack = useCallback(() => {
    if (isDisplayingOrderFills) {
      onHideOrderFills();
    } else {
      onDisplayOrder(undefined);
    }
  }, [onHideOrderFills, onDisplayOrder, isDisplayingOrderFills]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (open) {
        onDisplayOrder(undefined);
      }
    },
    [onDisplayOrder],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader className="flex flex-row gap-3 items-center">
            {selectedOrder && (
              <Button
                variant="outline"
                size="icon"
                onClick={onBack}
                className="p-1"
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
            )}
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {!selectedOrder && (
            <div className="flex flex-row gap-2 items-center justify-between">
              <SpotSelectMenu
                selected={selectedFilterItem}
                items={orderFilters}
                onSelect={(it) => setSelectedFilter(it.value as OrderFilter)}
              />
              {openOrders.length > 0 && (
                <IconButton onClick={onCancelAllOpenOrders} className="p-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton onClick={onCancelAllOpenOrders}>
                        {isCancelOrderLoading ? (
                          <Spinner className="size-4" />
                        ) : (
                          <TrashIcon className="size-4" />
                        )}
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>Cancel all orders</TooltipContent>
                  </Tooltip>
                </IconButton>
              )}
            </div>
          )}
          <OrdersProvider value={{ ...panelData, ...uiState, filteredOrders }}>
            <OrdersView />
          </OrdersProvider>

          {selectedOrder && (
            <div className="flex flex-row gap-2 items-center justify-between">
              <p className="text-sm text-foreground flex-1 font-medium">
                Sink Url
              </p>
              <a
                href={getSinkUrl(selectedOrder.id ?? "")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon className="size-4" />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            onClick={() => onOpenChange(true)}
            variant="outline"
            className="p-2"
          >
            <HistoryIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>View order history</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
};
