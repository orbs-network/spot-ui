import { SpotForm } from "@/components/spot/spot-form";
import { SwapType } from "@/lib/types";

export default function HomePage() {
  return <SpotForm swapType={SwapType.SWAP} />;
}
