import { useOrderHistoryPanel, SelectMeuItem, OrderStatus, Components } from "@orbs-network/spot-react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ArrowLeftIcon, HistoryIcon, LinkIcon } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "../ui/button";
import { DialogHeader } from "../ui/dialog";
import { SpotSelectMenu } from "./components";
import { isDev } from "@/lib/consts";

export const SpotsOrders = () => {
    const {
      selectedOrder,
      onSelectStatus,
      statuses,
      selectedStatus,
      onHideSelectedOrder,
      orders,
    } = useOrderHistoryPanel();
    const [open, setOpen] = useState(false);
  
    const menuItems = useMemo(() => {
      return statuses.map((status) => ({
        text: status.text,
        value: status.value || "all",
      }));
    }, [statuses]);
  
    const selectedItem = useMemo(() => {
      if (!selectedStatus || selectedStatus === "all") {
        return menuItems.find((item) => item.value === "all");
      }
      return menuItems.find((item) => item.value === selectedStatus);
    }, [menuItems, selectedStatus]);
  
    const _onSelectStatus = useCallback(
      (it: SelectMeuItem) => {
        onSelectStatus(
          it.value === "all" ? undefined : (it.value as OrderStatus)
        );
      },
      [onSelectStatus]
    );
  
    return (
      <>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader className="flex flex-row gap-3 items-center">
              {selectedOrder && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onHideSelectedOrder}
                  className="p-1"
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
              )}
              <DialogTitle>{selectedOrder?.title ?? `Orders (${orders.all?.length})`}</DialogTitle>
            </DialogHeader>
            {!selectedOrder && (
              <SpotSelectMenu
                selected={selectedItem}
                items={menuItems}
                onSelect={_onSelectStatus}
              />
            )}
            <Components.Orders />
            {selectedOrder && isDev && <div className="flex flex-row gap-2 items-center justify-between">
                <p className="text-sm text-foreground flex-1 font-medium">Sink Url</p>
                <a href={`https://order-sink-dev.orbs.network/?order=${selectedOrder.id.value}`} target="_blank" rel="noopener noreferrer">
                  <LinkIcon className="size-4" />
                </a>
              </div>}
          </DialogContent>
        </Dialog>
  
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={() => setOpen(true)}
              variant="outline"
              className="p-2"
            >
              <HistoryIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>View your order history</p>
          </TooltipContent>
        </Tooltip>
      </>
    );
  };