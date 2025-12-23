import { useMemo } from "react";
import {
  getNetwork,
  getPartners,
  PartnerPayloadItem,
} from "@orbs-network/spot-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { Avatar, AvatarImage } from "../ui/avatar";
import { useIsSpotTab } from "@/lib/hooks/use-tabs";

const partners = getPartners();

const isProd = process.env.NEXT_PUBLIC_MODE === "prod";

export function PartnerSelector() {
  const { partner, setPartner } = useSwapParams();
  const isSpotTab = useIsSpotTab();


  const selectedPartner = useMemo(() => {
    return partners.find((p) => `${p.partner}_${p.chainId}` === partner);
  }, [partner]);

  if (!isSpotTab || isProd) {
    return null;
  }

  return (
    <Select onValueChange={(value) => setPartner(value)} defaultValue={partner}>
      <SelectTrigger>
        <SelectValue>
          {selectedPartner && <PartnerDisplay partner={selectedPartner} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {partners.map((partner) => (
          <SelectItem
            value={`${partner.partner}_${partner.chainId}`}
            key={`${partner.partner}-${partner.chainId}`}
          >
            <PartnerDisplay partner={partner} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const PartnerDisplay = ({ partner }: { partner: PartnerPayloadItem }) => {
  const chain = getNetwork(partner.chainId);

  return (
    <div className="flex flex-row gap-2 items-center">
      <p className="capitalize">{partner.partner}</p>
      <span>-</span>
      <p>{chain?.shortname}</p>
      <Avatar className="size-4">
        <AvatarImage src={chain?.native.logoUrl} />
      </Avatar>
    </div>
  );
};
