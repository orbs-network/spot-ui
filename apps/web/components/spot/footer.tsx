import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { getSpotPartnerDemoLink, getSpotPartnerProdLink } from "@/lib/utils";
import pkg from "@orbs-network/spot/package.json";
import { Button } from "../ui/button";
import { LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { getPartners } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "../ui/skeleton";

const ReactJson = dynamic(() => import("react-json-view"), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-[200px]" />,
});

const SPOT_VERSION = pkg.version;

const ConfigDialog = () => {
  const { partner } = useSwapParams();

  const partnerConfig = useMemo(
    () => getPartners().find((p) => `${p.name}_${p.chainId}` === partner),
    [partner]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <p className="capitalize"> Config</p>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">
            {partnerConfig?.name} Config
          </DialogTitle>
        </DialogHeader>
        <ReactJson
          src={partnerConfig?.config || {}}
          name={false}
          collapsed={1}
          enableClipboard={true}
          displayDataTypes={false}
          theme="monokai"
          style={{
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export const SpotFooter = () => {
  const { parsedPartner, envMode } = useSwapParams();

  if (!parsedPartner) {
    return null;
  }

  const demo = getSpotPartnerDemoLink(parsedPartner);
  const prod = getSpotPartnerProdLink(parsedPartner);

  return (
    <div className="flex flex-row gap-2 items-center  fixed z-10 bottom-0 left-12 right-0 p-4">
      <p className="text-[16px] font-bold text-foreground/80">
        Spot: v{SPOT_VERSION} 
      </p>
      <div className="w-px h-4 bg-foreground/80" />
      <p className="text-[16px] font-bold text-foreground/80">Env: {envMode === 'prod' ? 'Prod' : 'Dev'}</p>
      {demo && (
        <Button variant="secondary" onClick={() => window.open(demo, "_blank")}>
          Demo
          <LinkIcon />
        </Button>
      )}
      {prod && (
        <Button variant="secondary" onClick={() => window.open(prod, "_blank")}>
          Prod
          <LinkIcon />
        </Button>
      )}
      <ConfigDialog />
    </div>
  );
};
