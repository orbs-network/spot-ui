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
import {
  SPOT_VERSION,
} from "@orbs-network/spot-ui";
import { useRePermitData } from "@orbs-network/spot-react";
import dynamic from "next/dynamic";
import { Skeleton } from "../ui/skeleton";

const ReactJson = dynamic(() => import("react-json-view"), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-[200px]" />,
});

const ConfigDialog = () => {
  const { parsedPartner } = useSwapParams();
  const { data: permitData } = useRePermitData();

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
            {parsedPartner} Config
          </DialogTitle>
        </DialogHeader>
        <ReactJson
          src={permitData || {}}
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
    <div className="fixed right-0 bottom-0 left-0 z-10 flex w-auto max-w-full flex-row items-center gap-2 overflow-x-auto bg-background/90 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm [scrollbar-width:none] sm:right-auto sm:left-12 sm:w-fit sm:bg-transparent sm:p-4 sm:backdrop-blur-none [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
      <p className="text-[16px] font-bold text-foreground/80">
        Spot: v{pkg.version}
      </p>
      {Number(SPOT_VERSION) >= 2 &&  <>
        <div className="w-px h-4 bg-foreground/80" />
        <p className="text-[16px] font-bold text-foreground/80">Env: {envMode === 'prod' ? 'Prod' : 'Dev'}</p>
      </>}
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
