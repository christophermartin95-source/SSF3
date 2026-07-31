import { MediaSectionView } from "@/components/media-section";
import { usePresenceSection } from "@/lib/realtime";
import overheardBanner from "@assets/overheard-banner.png";

export default function Overheard() {
  usePresenceSection("overheard");
  return (
    <MediaSectionView
      section="overheard"
      title="Overheard Sounds"
      description="Share those distinct sounds"
      bannerSrc={overheardBanner}
    />
  );
}
