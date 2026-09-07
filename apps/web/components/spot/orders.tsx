import {
  OrderFilter,
  SPOT_VERSION,
  useOrders,
  type Order,
  type Token,
} from "@orbs-network/spot-react";
import { OrdersView } from "./orders-view";
import { OrdersProvider, useOrdersUIState } from "./orders-context";
import { useTranslations } from "@/lib/use-translations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ArrowLeftIcon, HistoryIcon, LinkIcon } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "../ui/button";
import { DialogHeader } from "../ui/dialog";
import { SpotSelectMenu } from "./components";
import { getOrderTitle } from "@/lib/utils";
import { useCurrenciesQuery } from "@/lib/hooks/use-currencies-query";

const EMPTY_ORDERS: NonNullable<
  ReturnType<typeof useOrders>["data"]
> = {
  all: [],
  open: [],
  completed: [],
  cancelled: [],
  expired: [],
};

const getFilteredOrders = (
  orders: typeof EMPTY_ORDERS,
  filter: OrderFilter,
): Order[] => {
  switch (filter) {
    case OrderFilter.Open:
      return orders.open;
    case OrderFilter.Completed:
      return orders.completed;
    case OrderFilter.Cancelled:
      return orders.cancelled;
    case OrderFilter.Expired:
      return orders.expired;
    default:
      return orders.all;
  }
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

const ORDER_FILTERS = Object.values(OrderFilter).map((filter) => ({
  text: getOrderFilterText(filter),
  value: filter,
}));

const getSinkUrl = (orderId: string) => {
  if (Number(SPOT_VERSION) >= 2) {
    return `https://order-sink-v2.orbs.network/?order=${orderId}`;
  }
  return `https://order-sink.orbs.network/?order=${orderId}`;
};

export const SpotsOrders = () => {
  const { data, isLoading } = useOrders();
  const { data: currencies } = useCurrenciesQuery();
  const orders = data ?? EMPTY_ORDERS;
  const uiState = useOrdersUIState();
  const {
    selectedOrderKey,
    onDisplayOrder,
    isDisplayingOrderFills,
    onHideOrderFills,
  } = uiState;

  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<OrderFilter>(
    OrderFilter.All,
  );

  const filteredOrders = useMemo(
    () => getFilteredOrders(orders, selectedFilter),
    [orders, selectedFilter],
  );

  // History rows need token metadata only. Building one address map avoids
  // running the DEX's balance/USD-aware useCurrency hook twice per row.
  const tokensByAddress = useMemo<ReadonlyMap<string, Token>>(
    () =>
      new Map(
        currencies?.map((currency) => [
          currency.address.toLowerCase(),
          currency,
        ]) ?? [],
      ),
    [currencies],
  );

  const selectedRawOrder = useMemo(
    () =>
      orders.all.find((order: Order) => order.historyKey === selectedOrderKey),
    [orders.all, selectedOrderKey],
  );
  const selectedOrderTitle = getOrderTitle(selectedRawOrder?.type);

  const selectedOrder = useMemo(() => {
    return selectedOrderKey
      ? { title: selectedOrderTitle, id: selectedRawOrder?.id }
      : undefined;
  }, [selectedOrderKey, selectedOrderTitle, selectedRawOrder?.id]);

  const selectedFilterItem = useMemo(() => {
    return (
      ORDER_FILTERS.find((item) => item.value === selectedFilter) ||
      ORDER_FILTERS[0]
    );
  }, [selectedFilter]);

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

  const providerValue = useMemo(
    () => ({
      orders,
      isLoading,
      filteredOrders,
      tokensByAddress,
      ...uiState,
    }),
    [filteredOrders, isLoading, orders, tokensByAddress, uiState],
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
            <DialogDescription className="sr-only">
              View and manage your Spot order history.
            </DialogDescription>
          </DialogHeader>
          {!selectedOrder && (
            <div className="flex flex-row gap-2 items-center justify-between">
              <SpotSelectMenu
                selected={selectedFilterItem}
                items={ORDER_FILTERS}
                onSelect={(it) => setSelectedFilter(it.value as OrderFilter)}
              />
            </div>
          )}
          <OrdersProvider value={providerValue}>
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
            aria-label="View order history"
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
