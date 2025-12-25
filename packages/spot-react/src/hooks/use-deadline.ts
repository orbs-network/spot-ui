import { useMemo } from "react";
import { useSpotStore } from "../store";
import { getDeadline } from "@orbs-network/spot-ui";
import { useDuration } from "./use-duration";

export const useDeadline = () => {
  const currentTime = useSpotStore((s) => s.state.currentTime);
  const duration = useDuration().duration;

  return useMemo(() => getDeadline(currentTime, duration), [currentTime, duration]);
};
