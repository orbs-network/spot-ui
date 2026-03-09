import {
  useOrderHistoryPanel,
  Components,
  OrderFilter,
} from "@orbs-network/spot-react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ArrowLeftIcon, HistoryIcon, LinkIcon, TrashIcon } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { DialogHeader } from "../ui/dialog";
import { SpotSelectMenu } from "./components";
import { isDev } from "@/lib/consts";
import { Spinner } from "../ui/spinner";

export const SpotsOrders = () => {
  const {
    selectedOrder,
    onSelectOrderFilter,
    orderFilters,
    selectedOrderFilter,
    allOrders,
    onCancelAllOpenOrders,
    isCancelOrderLoading,
    isDisplayingOrderFills,
    onHideOrderFills,
    onDisplayOrder,
    openOrdersCount,
  } = useOrderHistoryPanel();
  const [open, setOpen] = useState(false);


  const title = useMemo(() => {
    if (isDisplayingOrderFills) {
      return `${selectedOrder?.title} order fills`;
    }
    return selectedOrder?.title ?? `Orders (${allOrders?.length})`;
  }, [isDisplayingOrderFills, selectedOrder, allOrders?.length]);

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
                selected={selectedOrderFilter}
                items={orderFilters}
                onSelect={(it) => onSelectOrderFilter(it.value as OrderFilter)}
              />
              {openOrdersCount > 0 && (
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
          <Components.Orders />

          {selectedOrder && isDev && (
            <div className="flex flex-row gap-2 items-center justify-between">
              <p className="text-sm text-foreground flex-1 font-medium">
                Sink Url
              </p>
              <a
                href={`https://order-sink-dev.orbs.network/?order=${selectedOrder.id.value}`}
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
