import {
  OrderFilter,
  OrderStatus,
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
import { getOrderTitle } from "@/lib/utils";

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
  const panelData = spot.orderHistoryPanel;
  const { orders } = panelData;
  const uiState = useOrdersUIState();
  const {
    selectedOrderID,
    onDisplayOrder,
    isDisplayingOrderFills,
    onHideOrderFills,
  } = uiState;

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

  const selectedRawOrder = useMemo(
    () => orders.all.find((o: Order) => o.id === selectedOrderID),
    [orders, selectedOrderID],
  );
  const selectedOrderTitle = getOrderTitle(selectedRawOrder?.type);

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
