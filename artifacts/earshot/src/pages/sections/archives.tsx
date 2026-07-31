import {
  useGetArchiveSubscriptionStatus,
  useCreateArchiveCheckoutSession,
  useListLiveSessions,
} from "@workspace/api-client-react";
import { MediaSectionView } from "@/components/media-section";
import { LiveSessionCard } from "@/pages/sections/go-live";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Archive, Lock, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

function ArchivedGoLive() {
  const { data: sessions, isLoading } = useListLiveSessions({ archived: true });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Go Live Archive</h2>
        <p className="text-sm text-[hsl(46,65%,55%)]">
          Live sessions from more than 3 months ago.
        </p>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && sessions?.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No archived sessions yet — check back after 3 months.
        </Card>
      )}

      {!isLoading && sessions && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sessions.map((session) => (
            <LiveSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivePaywall() {
  const { toast } = useToast();
  const checkout = useCreateArchiveCheckoutSession();

  async function handleSubscribe() {
    try {
      const result = await checkout.mutateAsync();
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast({
          title: "Couldn't start checkout",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
        <Lock className="h-6 w-6 text-accent-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Unlock the Archives</h2>
        <p className="text-sm text-[hsl(46,65%,55%)]">
          Subscribe to Archive Access to revisit every Overheard clip, Self Recorded upload,
          and Go Live session from more than 3 months ago.
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        £9.99 / month
      </div>
      <Button
        onClick={handleSubscribe}
        disabled={checkout.isPending}
        className="w-full gap-2"
        data-testid="button-subscribe-archives"
      >
        {checkout.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Subscribe to unlock
      </Button>
    </Card>
  );
}

export default function Archives() {
  const { data: subscription, isLoading } = useGetArchiveSubscriptionStatus();
  const [tab, setTab] = useState("overheard");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Archive className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Archives</h1>
          <p className="text-sm text-[hsl(46,65%,55%)]">
            Content older than 3 months lives here.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && !subscription?.active && <ArchivePaywall />}

      {!isLoading && subscription?.active && (
        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList>
            <TabsTrigger value="overheard" data-testid="tab-archive-overheard">
              Overheard
            </TabsTrigger>
            <TabsTrigger value="self-recorded" data-testid="tab-archive-self-recorded">
              Self Recorded
            </TabsTrigger>
            <TabsTrigger value="go-live" data-testid="tab-archive-go-live">
              Go Live
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overheard">
            <MediaSectionView
              section="overheard"
              title="SSF Archive"
              description="Overheard clips from more than 3 months ago."
              archived
            />
          </TabsContent>

          <TabsContent value="self-recorded">
            <MediaSectionView
              section="self_recorded"
              title="Self Recorded Archive"
              description="Self recorded uploads from more than 3 months ago."
              archived
            />
          </TabsContent>

          <TabsContent value="go-live">
            <ArchivedGoLive />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
