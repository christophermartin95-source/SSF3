import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useListLiveSessions,
  useCreateLiveSession,
  useJoinLiveSession,
  useLeaveLiveSession,
  type LiveSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePresenceSection, useRealtime } from "@/lib/realtime";
import { SectionPresence } from "@/components/section-presence";
import { useLiveBroadcaster, useLiveListener } from "@/lib/liveAudio";
import { Radio, CalendarClock, Mic, Square, Headphones } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CommentSection } from "@/components/comment-section";
import goLiveBanner from "@assets/go-live-banner.png";

function StartSessionDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [scheduleFor, setScheduleFor] = useState("");
  const createSession = useCreateLiveSession();
  const qc = useQueryClient();
  const { toast } = useToast();

  async function handleSubmit(goLiveNow: boolean) {
    if (!title.trim()) return;
    try {
      await createSession.mutateAsync({
        data: {
          title: title.trim(),
          scheduledAt: goLiveNow || !scheduleFor ? undefined : new Date(scheduleFor).toISOString(),
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/live/sessions"] });
      toast({
        title: goLiveNow || !scheduleFor ? "You're live!" : "Session scheduled",
        description: title.trim(),
      });
      setTitle("");
      setScheduleFor("");
      setOpen(false);
    } catch (err) {
      toast({
        title: "Couldn't start session",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-go-live">
          <Radio className="h-4 w-4" />
          GO LIVE FOR THE COMMUNITY
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a live session</DialogTitle>
          <DialogDescription>
            Broadcast right now, or schedule it and everyone gets notified when it starts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="live-title">Title</Label>
            <Input
              id="live-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this session about?"
              data-testid="input-live-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="live-schedule">Schedule for later (optional)</Label>
            <Input
              id="live-schedule"
              type="datetime-local"
              value={scheduleFor}
              onChange={(e) => setScheduleFor(e.target.value)}
              data-testid="input-live-schedule"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full gap-2"
            disabled={!title.trim() || createSession.isPending}
            onClick={() => handleSubmit(true)}
            data-testid="button-confirm-go-live"
          >
            <Radio className="h-4 w-4" />
            Go live now
          </Button>
          {scheduleFor && (
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={createSession.isPending}
              onClick={() => handleSubmit(false)}
              data-testid="button-confirm-schedule"
            >
              <CalendarClock className="h-4 w-4" />
              Schedule instead
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LiveSessionCard({ session }: { session: LiveSession }) {
  const { user } = useUser();
  const qc = useQueryClient();
  const isHost = user?.id === session.hostUserId;
  const audioElRef = useRef<HTMLAudioElement>(null);

  const broadcaster = useLiveBroadcaster(isHost ? session.id : null);
  const listener = useLiveListener(!isHost ? session.id : null);
  const joinSession = useJoinLiveSession();
  const leaveSession = useLeaveLiveSession();

  const isLive = session.status === "live";
  const isScheduled = session.status === "scheduled";

  useEffect(() => {
    if (isHost && isLive && !broadcaster.isBroadcasting) {
      void broadcaster.start();
    }
  }, [isHost, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleListen() {
    if (!audioElRef.current) return;
    if (listener.isListening) {
      listener.stop();
      await leaveSession.mutateAsync({ sessionId: session.id });
    } else {
      await joinSession.mutateAsync({ sessionId: session.id });
      listener.start(audioElRef.current);
    }
    qc.invalidateQueries({ queryKey: ["/api/live/sessions"] });
  }

  return (
    <Card className="p-5" data-testid={`card-live-session-${session.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium" data-testid={`text-live-title-${session.id}`}>
              {session.title}
            </h3>
            {isLive && (
              <Badge className="bg-destructive text-destructive-foreground gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </Badge>
            )}
            {isScheduled && <Badge variant="secondary">Scheduled</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Hosted by @{session.hostUsername}
            {isScheduled && session.scheduledAt && (
              <> · {formatDistanceToNow(new Date(session.scheduledAt), { addSuffix: true })}</>
            )}
            {isLive && <> · {session.listenerCount} listening</>}
          </p>
        </div>
      </div>

      {isLive && (
        <div className="mt-4 space-y-2">
          <audio ref={audioElRef} className="w-full" controls />
          {!isHost && (
            <Button
              variant={listener.isListening ? "outline" : "default"}
              className="gap-2"
              onClick={handleListen}
              data-testid={`button-listen-${session.id}`}
            >
              <Headphones className="h-4 w-4" />
              {listener.isListening ? "Stop listening" : "Listen"}
            </Button>
          )}
          {isHost && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Mic className="h-3.5 w-3.5" /> Broadcasting your mic
              </Badge>
              <Button
                size="sm"
                variant="destructive"
                className="gap-2"
                onClick={broadcaster.stop}
                data-testid={`button-end-live-${session.id}`}
              >
                <Square className="h-3.5 w-3.5" />
                End session
              </Button>
            </div>
          )}
          {broadcaster.error && (
            <p className="text-sm text-destructive">{broadcaster.error}</p>
          )}
          {listener.error && (
            <p className="text-sm text-destructive">{listener.error}</p>
          )}
        </div>
      )}

      <CommentSection targetType="live_session" targetId={session.id} canPin={isHost} />
    </Card>
  );
}

export default function GoLive() {
  usePresenceSection("go_live");
  const { subscribe } = useRealtime();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: sessions, isLoading } = useListLiveSessions();

  useEffect(() => {
    const unsubStarted = subscribe("live:started", (msg) => {
      const session = (msg as { session?: LiveSession }).session;
      qc.invalidateQueries({ queryKey: ["/api/live/sessions"] });
      if (session) toast({ title: "Someone just went live", description: session.title });
    });
    const unsubScheduled = subscribe("live:scheduled", () => {
      qc.invalidateQueries({ queryKey: ["/api/live/sessions"] });
    });
    const unsubEnded = subscribe("live:ended", () => {
      qc.invalidateQueries({ queryKey: ["/api/live/sessions"] });
    });
    return () => {
      unsubStarted();
      unsubScheduled();
      unsubEnded();
    };
  }, [subscribe, qc, toast]);

  const [sort, setSort] = useState<"newest" | "popular" | "oldest">("newest");

  function sortSessions(list: LiveSession[]): LiveSession[] {
    const time = (s: LiveSession) =>
      new Date(s.scheduledAt ?? s.startedAt).getTime();
    return [...list].sort((a, b) => {
      if (sort === "popular")
        return b.listenerCount - a.listenerCount || time(b) - time(a);
      if (sort === "oldest") return time(a) - time(b);
      return time(b) - time(a);
    });
  }

  const live = sortSessions(sessions?.filter((s) => s.status === "live") ?? []);
  const scheduled = sortSessions(sessions?.filter((s) => s.status === "scheduled") ?? []);
  const ended = sortSessions(sessions?.filter((s) => s.status === "ended") ?? []);

  return (
    <div className="space-y-6">
      <h2 className="sr-only">Go Live For The Community</h2>
      <img
        src={goLiveBanner}
        alt="Go Live For The Community"
        className="-mx-4 w-[calc(100%+2rem)] max-w-none rounded-none object-cover object-center shadow-lg md:mx-0 md:w-full md:rounded-lg"
        data-testid="img-section-banner"
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <StartSessionDialog />
      </div>

      <div className="flex items-center justify-end">
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-40" data-testid="select-sort-go-live">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="popular">Most popular</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SectionPresence section="go_live" />

      {isLoading && <p className="text-sm text-muted-foreground">Loading sessions…</p>}

      {!isLoading && live.length === 0 && scheduled.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No one is live right now. Start a session to get things going.
        </Card>
      )}

      {live.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Live now</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {live.map((session) => (
              <LiveSessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {scheduled.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Scheduled</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {scheduled.map((session) => (
              <LiveSessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {ended.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Past sessions</h3>
          <div className="grid gap-4 sm:grid-cols-2 opacity-70">
            {ended.slice(0, 4).map((session) => (
              <LiveSessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
