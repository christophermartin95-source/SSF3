import { useRef, useCallback, useEffect, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";

/**
 * Media player with native controls plus buttons to skip 10 seconds
 * backward or forward. Renders a <video> element for video clips (so the
 * picture shows) and an <audio> element otherwise.
 *
 * Tracks which time ranges were actually played and reports them via
 * onPlaySegment so the caller can build a "most replayed" heatmap.
 */
export function AudioPlayer({
  src,
  onPlay,
  onPlaySegment,
  testId,
  className,
  isVideo = false,
  poster,
}: {
  src: string;
  onPlay?: () => void;
  onPlaySegment?: (startSecond: number, endSecond: number) => void;
  testId?: string;
  className?: string;
  isVideo?: boolean;
  poster?: string;
}) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const segmentStartRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [duration, setDuration] = useState<number>(0);

  function skip(seconds: number) {
    const media = mediaRef.current;
    if (!media) return;
    const next = media.currentTime + seconds;
    const max = Number.isFinite(media.duration) ? media.duration : next;
    media.currentTime = Math.min(Math.max(0, next), max);
  }

  const flushSegment = useCallback(() => {
    const start = segmentStartRef.current;
    if (start === null) return;
    const end = lastTimeRef.current;
    if (end > start) {
      onPlaySegment?.(start, end);
    }
    segmentStartRef.current = null;
  }, [onPlaySegment]);

  useEffect(() => {
    return () => {
      flushSegment();
    };
  }, [flushSegment]);

  function handlePlay() {
    const media = mediaRef.current;
    if (!media) return;
    segmentStartRef.current = media.currentTime;
    lastTimeRef.current = media.currentTime;
    onPlay?.();
  }

  function handlePause() {
    const media = mediaRef.current;
    if (!media) return;
    lastTimeRef.current = media.currentTime;
    flushSegment();
  }

  function handleEnded() {
    const media = mediaRef.current;
    if (!media) return;
    lastTimeRef.current = media.duration;
    flushSegment();
  }

  function handleSeeked() {
    const media = mediaRef.current;
    if (!media) return;
    // If we were playing, end the previous segment and start a new one
    if (segmentStartRef.current !== null) {
      lastTimeRef.current = media.currentTime;
      flushSegment();
      segmentStartRef.current = media.currentTime;
    }
  }

  function handleTimeUpdate() {
    const media = mediaRef.current;
    if (!media) return;
    lastTimeRef.current = media.currentTime;
    if (segmentStartRef.current === null && !media.paused) {
      segmentStartRef.current = media.currentTime;
    }
  }

  function handleLoadedMetadata() {
    const media = mediaRef.current;
    if (media && Number.isFinite(media.duration)) {
      setDuration(media.duration);
    }
  }

  return (
    <div className={className}>
      {isVideo ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          controls
          preload="metadata"
          playsInline
          poster={poster}
          className="block w-full h-auto max-h-[70vh] rounded-md bg-black object-contain [color-scheme:dark]"
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onSeeked={handleSeeked}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          src={src}
          data-testid={testId}
        />
      ) : (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          controls
          preload="none"
          className="ssf-audio w-full rounded-md"
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onSeeked={handleSeeked}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          src={src}
          data-testid={testId}
        />
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => skip(-10)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover-elevate active-elevate-2"
          data-testid={testId ? `${testId}-back-10` : undefined}
          aria-label="Skip back 10 seconds"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          10s
        </button>
        <button
          type="button"
          onClick={() => skip(10)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover-elevate active-elevate-2"
          data-testid={testId ? `${testId}-forward-10` : undefined}
          aria-label="Skip forward 10 seconds"
        >
          10s
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
