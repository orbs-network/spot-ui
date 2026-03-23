import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { InfoIcon, SettingsIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { NumericInput } from "./ui/numeric-input";
import { useIsSpotTab } from "@/lib/hooks/use-tabs";
import { DEFAULT_PRICE_PROTECTION, DEFAULT_SLIPPAGE } from "@/lib/consts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const FormItem = ({
  label,
  children,
  tooltip,
}: {
  label: string;
  children: React.ReactNode;
  tooltip?: string;
}) => {
  return (
    <div className="flex flex-row items-center gap-2 justify-between w-full">
      <div className="flex flex-row items-center gap-2">
        <p className="text-sm font-medium">{label}</p>

        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
};

const DefaultButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Default
    </Button>
  );
};

const SpotSettings = () => {
  const { priceProtection, setPriceProtection } = useSettings();
  return (
    <div className="flex flex-col gap-2 w-full">
      <FormItem
        label="Price Protection"
        tooltip="The protocol uses an oracle price to help protect users from unfavorable executions. If the execution
                price is worse than the oracle price by more than the allowed percentage, the transaction will not be
                executed."
      >
        <div className="flex flex-row gap-2 items-center justify-end flex-1">
          <NumericInput
            value={priceProtection ? priceProtection.toString() : ""}
            onChange={(value) => setPriceProtection(Number(value))}
            className="text-center text-[16px] bg-accent/80 p-2 rounded-md max-w-[100px] w-full"
            suffix="%"
            placeholder="0.0%"
          />
          <DefaultButton
            onClick={() => setPriceProtection(DEFAULT_PRICE_PROTECTION)}
          />
        </div>
      </FormItem>
    </div>
  );
};

const SwapSettings = () => {
  const { slippage, setSlippage } = useSettings();
  return (
    <div className="flex flex-col gap-2 w-full">
      <FormItem label="Slippage">
        <div className="flex flex-row gap-2 items-center justify-end flex-1">
          <NumericInput
            value={slippage ? slippage.toString() : ""}
            onChange={(value) => setSlippage(Number(value))}
            className="text-center text-[16px] bg-accent/80 p-2 rounded-md max-w-[100px] w-full"
            suffix="%"
            placeholder="0.0%"
          />
          <DefaultButton onClick={() => setSlippage(DEFAULT_SLIPPAGE)} />
        </div>
      </FormItem>
    </div>
  );
};

export const SettingsModal = () => {
  const isSpotTab = useIsSpotTab();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SettingsIcon className="size-4" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        {isSpotTab ? <SpotSettings /> : <SwapSettings />}
      </DialogContent>
    </Dialog>
  );
};
