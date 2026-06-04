import { SpotUiProvider } from "@/components/spot/spot-ui-provider";
import { UtilaContent } from "@/components/utila/content";

export default function HistoryPage() {
  return (
    <SpotUiProvider>
      <UtilaContent />
    </SpotUiProvider>
  );
}
