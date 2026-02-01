import { useMemo, useState } from "react";
import {
  getNetwork,
  getPartners,
  PartnerPayloadItem,
} from "@orbs-network/spot-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { Avatar, AvatarImage } from "../ui/avatar";
import { useIsSpotTab } from "@/lib/hooks/use-tabs";
import { getSpotPartnerProdLink } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";

const partners = getPartners();
const isProd = process.env.NEXT_PUBLIC_MODE === "prod";

export function PartnerSelector() {
  const { partner, setPartner } = useSwapParams();
  const isSpotTab = useIsSpotTab();
  const [open, setOpen] = useState(false);

  const selectedPartner = useMemo(() => {
    return partners.find((p) => `${p.name}_${p.chainId}` === partner);
  }, [partner]);

  if (!isSpotTab || isProd) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-fit justify-between gap-2"
        >
          {selectedPartner ? (
            <PartnerDisplay partner={selectedPartner} />
          ) : (
            "Select partner..."
          )}
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit p-0" align="start">
        <Command
          filter={(value, search) => {
            const name = value.split("_")[0];
            return name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by name..." />
          <CommandList>
            <CommandEmpty>No partners match.</CommandEmpty>
            {partners.map((p) => {
              const value = `${p.name}_${p.chainId}`;
              return (
                <CommandItem
                  key={value}
                  value={value}
                  onSelect={() => {
                    setPartner(value);
                    setOpen(false);
                  }}
                >
                  <PartnerDisplay partner={p} />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const PartnerDisplay = ({
  partner,
  isSelector = false,
}: {
  partner: PartnerPayloadItem;
  isSelector?: boolean;
}) => {
  const chain = getNetwork(partner.chainId);
  const prodLink = getSpotPartnerProdLink(partner.name);

  return (
    <div className="flex flex-row gap-2 items-center">
      <p className="capitalize">{partner.name}</p>
      <span>-</span>
      <p>{chain?.shortname}</p>
      <Avatar className="size-4">
        <AvatarImage src={chain?.native.logoUrl} />
      </Avatar>
      {prodLink && !isSelector ? (
        <small className="text-xs text-gray-500">Prod</small>
      ) : null}
    </div>
  );
};
