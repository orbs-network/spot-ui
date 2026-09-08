import { useState } from "react";
import {
  getPartners,
  type PartnerPayloadItem,
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
import {
  getChainName,
  getNativeTokenLogoUrl,
  getNativeTokenSymbol,
  getSpotPartnerProdLink,
} from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";

const partners = getPartners();
const getPartnerValue = ({ name, chainId }: PartnerPayloadItem) =>
  `${name}_${chainId}`;
const partnerSearchText = new Map(
  partners.map((partner) => [
    getPartnerValue(partner),
    [
      partner.name,
      getChainName(partner.chainId),
      getNativeTokenSymbol(partner.chainId),
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

export function PartnerSelector() {
  const { partner, setPartner } = useSwapParams();
  const isSpotTab = useIsSpotTab();
  const [open, setOpen] = useState(false);

  const selectedPartner = partners.find(
    (item) => getPartnerValue(item) === partner,
  );
  if (!isSpotTab) {
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
            const terms = search.trim().toLowerCase().split(/\s+/);
            const searchableText = partnerSearchText.get(value) ?? "";
            return terms.every((term) => searchableText.includes(term))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder="Search partner, chain, or symbol..." />
          <CommandList>
            <CommandEmpty>No partners match.</CommandEmpty>
            {partners.map((p) => {
              const value = getPartnerValue(p);
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
  const chainName = getChainName(partner.chainId);
  const chainLogoUrl = getNativeTokenLogoUrl(partner.chainId);
  const prodLink = getSpotPartnerProdLink(partner.name);

  return (
    <div className="flex flex-row gap-2 items-center">
      <p className="capitalize">{partner.name}</p>
      <span>-</span>
      <p>{chainName}</p>
      <Avatar className="size-4">
        <AvatarImage src={chainLogoUrl} />
      </Avatar>
      {prodLink && !isSelector ? (
        <small className="text-xs text-gray-500">Prod</small>
      ) : null}
    </div>
  );
};
