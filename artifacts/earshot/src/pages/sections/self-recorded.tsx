import { MediaSectionView } from "@/components/media-section";
import { usePresenceSection } from "@/lib/realtime";
import selfRecordedBanner from "@assets/self-recorded-banner.png";

export default function SelfRecorded() {
  usePresenceSection("self_recorded");
  return (
    <MediaSectionView
      section="self_recorded"
      title="Self Recorded Sounds"
      description="Share self recorded sounds"
      bannerSrc={selfRecordedBanner}
    />
  );
}
