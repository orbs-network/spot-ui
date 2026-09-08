import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const SpotTooltip = ({
  children,
  text,
}: {
  children?: ReactNode;
  text?: string;
}) => {
  if (!text) return null;

  return (
    <Tooltip>
      <TooltipTrigger>
        {children || <InfoIcon className="size-4" />}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
};

export const SpotFormLabel = ({
  title,
  tooltip,
}: {
  title: string;
  tooltip?: string;
}) => (
  <div className="flex items-center gap-2">
    <p className="text-sm text-foreground/80 font-medium">{title}</p>
    {tooltip ? <SpotTooltip text={tooltip} /> : null}
  </div>
);

export const SpotFormCard = ({
  children,
  title,
  className = "",
  tooltip,
  error,
  headerContent,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  tooltip?: string;
  error?: boolean;
  headerContent?: ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-col gap-2 bg-card p-4 rounded-lg group relative border border-transparent",
      className,
      error ? "border-destructive/80" : "",
    )}
  >
    {headerContent ||
      (title ? <SpotFormLabel title={title} tooltip={tooltip} /> : null)}
    {children}
  </div>
);
