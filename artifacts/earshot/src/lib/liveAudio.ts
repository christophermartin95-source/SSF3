import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "./realtime";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string {
  for (const mime of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "audio/webm";
}

/** Hook for the host broadcasting live audio from their microphone. */
export function useLiveBroadcaster(sessionId: number | null) {
  const { sendJson, sendBinary } = useRealtime();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsBroadcasting(false);
    if (sessionId != null) sendJson({ type: "live:end", sessionId });
  }, [sessionId, sendJson]);

  const start = useCallback(async () => {
    if (sessionId == null) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      sendJson({ type: "live:start", sessionId });

      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorderRef.current = recorder;
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          sendBinary(await event.data.arrayBuffer());
        }
      };
      // requestData() yields MediaSource-friendly chunks (init segment on first
      // call, media segments thereafter). start(timeslice) produces standalone
      // files which break SourceBuffer.appendBuffer after the first chunk.
      recorder.start();
      // Pull a chunk every 250 ms so listeners receive continuous audio.
      intervalRef.current = setInterval(() => {
        if (recorder.state === "recording") recorder.requestData();
      }, 250);
      setIsBroadcasting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access was denied.");
    }
  }, [sessionId, sendJson, sendBinary]);

  useEffect(() => stop, [stop]);

  return { isBroadcasting, error, start, stop };
}

/** Hook for a listener tuning in to a live broadcast session. */
export function useLiveListener(sessionId: number | null) {
  const { sendJson, subscribe } = useRealtime();
  const [isListening, setIsListening] = useState(false);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<Uint8Array[]>([]);

  const appendNext = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating) return;
    const next = queueRef.current.shift();
    if (next) {
      try {
        sourceBuffer.appendBuffer(next as BufferSource);
      } catch (err) {
        // If the buffer is full or the segment is invalid, drop it and keep going.
        console.warn("SourceBuffer append failed:", err);
        appendNext();
      }
    }
  }, []);

  // Subscribe to live chunks as soon as the hook mounts so we never miss the
  // init segment that arrives right after live:join.
  useEffect(() => {
    if (sessionId == null) return;
    const unsubscribe = subscribe("live:chunk", (msg) => {
      const chunk = msg as { sessionId: number; data: string };
      if (chunk.sessionId !== sessionId) return;
      const binary = atob(chunk.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      queueRef.current.push(bytes);
      appendNext();
    });
    return unsubscribe;
  }, [sessionId, subscribe, appendNext]);

  const start = useCallback(
    (audioEl: HTMLAudioElement) => {
      if (sessionId == null) return;
      setListenerError(null);
      audioRef.current = audioEl;
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      const objectUrl = URL.createObjectURL(mediaSource);
      audioEl.src = objectUrl;

      const onSourceOpen = () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer(pickMimeType());
          sourceBufferRef.current = sourceBuffer;
          sourceBuffer.addEventListener("updateend", appendNext);
          // Drain any chunks that arrived before sourceopen fired.
          appendNext();
        } catch (err) {
          setListenerError("Your browser does not support this live audio format.");
          console.error("Failed to add SourceBuffer:", err);
        }
      };

      const onSourceError = (e: Event) => {
        setListenerError("Live audio playback error.");
        console.error("MediaSource error:", e);
      };

      mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });
      mediaSource.addEventListener("error", onSourceError);

      // Tell the server we're ready BEFORE setting isListening so the
      // subscription (already active) will receive the first chunk immediately.
      sendJson({ type: "live:join", sessionId });
      setIsListening(true);
      void audioEl.play().catch(() => {});

      return () => {
        mediaSource.removeEventListener("sourceopen", onSourceOpen);
        mediaSource.removeEventListener("error", onSourceError);
      };
    },
    [sessionId, sendJson, appendNext],
  );

  const stop = useCallback(() => {
    if (sessionId != null) sendJson({ type: "live:leave", sessionId });
    setIsListening(false);
    setListenerError(null);
    queueRef.current = [];
    const sb = sourceBufferRef.current;
    sourceBufferRef.current = null;
    if (sb) {
      try {
        sb.removeEventListener("updateend", appendNext);
      } catch {}
    }
    const ms = mediaSourceRef.current;
    mediaSourceRef.current = null;
    if (ms && ms.readyState === "open") {
      try {
        ms.endOfStream();
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
      const src = audioRef.current.src;
      audioRef.current.removeAttribute("src");
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
  }, [sessionId, sendJson, appendNext]);

  // Cleanup on unmount or sessionId change.
  useEffect(() => {
    return () => {
      queueRef.current = [];
      const sb = sourceBufferRef.current;
      sourceBufferRef.current = null;
      if (sb) {
        try {
          sb.removeEventListener("updateend", appendNext);
        } catch {}
      }
      const ms = mediaSourceRef.current;
      mediaSourceRef.current = null;
      if (ms && ms.readyState === "open") {
        try {
          ms.endOfStream();
        } catch {}
      }
      if (audioRef.current) {
        audioRef.current.pause();
        const src = audioRef.current.src;
        audioRef.current.removeAttribute("src");
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      }
    };
  }, [sessionId, appendNext]);

  return { isListening, error: listenerError, start, stop };
}
