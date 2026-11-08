import { Skeleton } from "./skeleton";
import { useFormatNumber } from "@/lib/hooks/common";

export const USD = ({
  value,
  isLoading = false,
}: {
  value?: string;
  isLoading?: boolean;
}) => {
  const formatted = useFormatNumber({ value, decimalScale: 2 });

  return (
    <div className="flex items-center gap-2">
      {isLoading ? (
        <Skeleton className="h-4 w-[50px]" />
      ) : (
        <p className="text-sm text-muted-foreground">{formatted ? `$${formatted}` : "—"}</p>
      )}
    </div>
  );
};
