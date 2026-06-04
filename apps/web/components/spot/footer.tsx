import { useSwapParams } from "@/lib/hooks/use-swap-params";
import pkg from "@orbs-network/spot/package.json";
import { SPOT_VERSION } from "@orbs-network/spot-ui";

export const SpotFooter = () => {
  const { envMode } = useSwapParams();

  return (
    <div className="flex flex-row gap-2 items-center  fixed z-10 bottom-0 left-12 right-0 p-4 w-fit">
      <p className="text-[16px] font-bold text-foreground/80">
        Spot: v{pkg.version}
      </p>
      {Number(SPOT_VERSION) >= 2 &&  <>
        <div className="w-px h-4 bg-foreground/80" />
        <p className="text-[16px] font-bold text-foreground/80">Env: {envMode === 'prod' ? 'Prod' : 'Dev'}</p>
      </>}
    </div>
  );
};
