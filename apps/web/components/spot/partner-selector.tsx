import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useSpotPartners } from "@/lib/hooks/use-spot-partners";
import { useIsSpotTab } from "@/lib/hooks/use-tabs";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";

const partnerLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

export function PartnerSelector() {
  const { parsedPartner, setPartner } = useSwapParams();
  const { data, isPending, isError, isFetching, refetch } = useSpotPartners();
  const isSpotTab = useIsSpotTab();
  const [open, setOpen] = useState(false);
  const partners = [...new Set(data?.map(({ name }) => name))];

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
              className="justify-between gap-2"
            >
              {isPending ? "Loading partners…" : partnerLabel(parsedPartner)}
              <ChevronDownIcon
                className="size-4 opacity-50"
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput
                aria-label="Search partners"
                name="partner-search"
                autoComplete="off"
                placeholder="Search partners…"
              />
              <CommandList>
                <CommandEmpty>No partners match.</CommandEmpty>
                {partners.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      setPartner(name);
                      setOpen(false);
                    }}
                  >
                    {partnerLabel(name)}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>Unable to load partners.</span>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : data?.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No partners available.
        </p>
      ) : null}
    </div>
  );
}
