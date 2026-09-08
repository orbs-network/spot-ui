import { useEffect } from "react";
import {
  ORBS_TWAP_FAQ_URL,
  useDisclaimer,
  useInputErrors,
  type ClientErrorFallbackProps,
} from "@orbs-network/spot-react";
import { AlertTriangleIcon, InfoIcon } from "lucide-react";
import { useConnection, useSwitchChain } from "wagmi";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useTranslations } from "@/lib/use-translations";
import { Button } from "../ui/button";

export const DisclaimerPanel = () => {
  const t = useTranslations();
  const disclaimer = useDisclaimer();
  if (!disclaimer) return null;

  return (
    <div className="text-sm bg-card p-2 rounded-md flex flex-row gap-2">
      <InfoIcon className="size-4 text-muted-foreground relative top-0.5" />
      <p className="text-sm text-foreground/70 flex-1">
        {t(disclaimer)}{" "}
        <a
          href={ORBS_TWAP_FAQ_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary"
        >
          Learn more
        </a>
      </p>
    </div>
  );
};

export const InputsErrorPanel = () => {
  const t = useTranslations();
  const error = useInputErrors();
  if (!error) return null;

  return (
    <div className="flex flex-row gap-2 bg-destructive/50 p-2 rounded-md">
      <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
      <p className="text-sm text-foreground flex-1 font-medium">
        {t(error.type, error.args)}
      </p>
    </div>
  );
};

export const SpotChainSynchronizer = () => {
  const { chainId } = useConnection();
  const { targetChainId } = useSwapParams();
  const switchChain = useSwitchChain();

  useEffect(() => {
    if (chainId && targetChainId && chainId !== Number(targetChainId)) {
      switchChain.mutate({ chainId: Number(targetChainId) });
    }
  }, [chainId, switchChain, targetChainId]);

  return null;
};

export const ClientErrorFallback = ({
  retry,
  isRetrying,
}: ClientErrorFallbackProps) => {
  const t = useTranslations();

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg bg-card p-4"
    >
      <p className="text-sm font-medium">{t("orderConfigurationError")}</p>
      <Button
        type="button"
        onClick={() => void retry()}
        isLoading={isRetrying}
      >
        {t("retryOrderConfiguration")}
      </Button>
    </div>
  );
};
