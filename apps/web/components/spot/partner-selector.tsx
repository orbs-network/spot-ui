import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from "../ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useSpotPartners } from "@/lib/hooks/use-spot-partners";
import { useIsSpotTab } from "@/lib/hooks/use-tabs";
import { getChainName } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";

export function PartnerSelector() {
  const { parsedPartner, targetChainId, setPartner } = useSwapParams();
  const { data, isPending, isError, isFetching, refetch } = useSpotPartners();
  const isSpotTab = useIsSpotTab();
  const [open, setOpen] = useState(false);
  const partners = [...new Set(data?.map(({ name }) => name))];
  const chainIds = data?.filter(({ name }) => name === parsedPartner)
    .map(({ chainId }) => chainId) ?? [];

  if (!isSpotTab) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-label="Partner"
              aria-expanded={open}
              disabled={isPending || !data}
              className="justify-between gap-2 capitalize"
            >
              {isPending ? "Loading partners…" : parsedPartner}
              <ChevronDownIcon className="size-4 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput aria-label="Search partners" name="partner-search" autoComplete="off" placeholder="Search partners…" />
              <CommandList>
                <CommandEmpty>No partners match.</CommandEmpty>
                {partners.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    className="capitalize"
                    onSelect={() => {
                      const available = data?.filter((item) => item.name === name) ?? [];
                      const next = available.find(({ chainId }) => String(chainId) === targetChainId) ?? available[0];
                      if (next) setPartner(`${name}_${next.chainId}`);
                      setOpen(false);
                    }}
                  >
                    {name}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select
          value={targetChainId}
          disabled={isPending || !data}
          onValueChange={(chainId) => setPartner(`${parsedPartner}_${chainId}`)}
        >
          <SelectTrigger aria-label="Chain" className="max-w-full">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            {!chainIds.includes(Number(targetChainId)) && (
              <SelectItem value={targetChainId} disabled>
                {getChainName(Number(targetChainId)) || `Chain ${targetChainId}`}
              </SelectItem>
            )}
            {chainIds.map((chainId) => (
              <SelectItem key={chainId} value={String(chainId)}>
                {getChainName(chainId) || `Chain ${chainId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>Unable to load partners.</span>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : data?.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">No partners available.</p>
      ) : null}
    </div>
  );
}
