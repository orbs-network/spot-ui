import { getPartners } from "../spot-partners";
import { useQuery } from "@tanstack/react-query";

export const useSpotPartners = () => useQuery({
  queryKey: ["spot", "partners"],
  queryFn: getPartners,
  staleTime: 5 * 60_000,
  retry: 2,
});
