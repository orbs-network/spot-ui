"use client";

import { SpotForm } from "@/components/spot/spot-form";
import { OrderType } from "@orbs-network/spot-react";

export default function TwapPage() {
  return <SpotForm orderType={OrderType.TWAP} />;
}
