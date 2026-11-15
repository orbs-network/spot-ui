import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { InfoIcon, SettingsIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { NumericInput } from "./ui/numeric-input";
import { useSelectedFormTab } from "@/lib/hooks/use-tabs";
import { TABS } from "@/lib/types";
import { DEFAULT_PRICE_PROTECTION } from "@/lib/consts";
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
            <TooltipTrigger aria-label={`${label} help`}>
              <InfoIcon aria-hidden="true" className="size-4" />
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
            ariaLabel="Price protection percent"
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
  const { slippage, isCustomSlippage, setSlippage, resetSlippage } = useSettings();
  const [slippageInput, setSlippageInput] = useState(() => isCustomSlippage ? slippage.toString() : "");
  return (
    <div className="flex flex-col gap-2 w-full">
      <FormItem
        label="Slippage"
        tooltip="Enter up to 50%. Clear the field or enter 0 to restore automatic slippage."
      >
        <div className="flex flex-row gap-2 items-center justify-end flex-1">
          <NumericInput
            ariaLabel="Slippage percent"
            value={slippageInput}
            onChange={(value) => {
              setSlippageInput(value);
              setSlippage(Number(value));
            }}
            onBlur={() => setSlippageInput(isCustomSlippage ? slippage.toString() : "")}
            maxValue={50}
            decimalScale={2}
            className="text-center text-[16px] bg-accent/80 p-2 rounded-md max-w-[100px] w-full focus-visible:ring-2 focus-visible:ring-ring"
            suffix="%"
            placeholder="Auto"
          />
          <DefaultButton onClick={() => {
            resetSlippage();
            setSlippageInput("");
          }} />
        </div>
      </FormItem>
      <p role="status" className="text-xs text-muted-foreground">
        {isCustomSlippage && slippage > 0
          ? "Using your custom slippage."
          : "Automatic slippage uses at least 1% for trades worth $100 or less when pricing is available."}
      </p>
    </div>
  );
};

export const SettingsModal = () => {
  const isSwap = useSelectedFormTab()?.value === TABS.SWAP;
  const [open, setOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label="Settings">
          <SettingsIcon aria-hidden="true" className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>Settings</DialogTitle>
          <DialogDescription className="sr-only">Adjust execution protection for your order.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {isSwap ? <SwapSettings /> : <SpotSettings />}
        </div>
      </DialogContent>
    </Dialog>
  );
};
