import { useState } from "react";
import { useParams, useSearchParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUser,
  useToggleFollow,
  useListFollowers,
  useListFollowing,
  useListUserFavorites,
  useListUserLikes,
  type User,
  type MediaClip,
} from "@workspace/api-client-react";
import { usePresenceSection } from "@/lib/realtime";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipCard } from "@/components/media-section";
import { Loader2, UserPlus, UserCheck, Bookmark, Heart } from "lucide-react";

function initials(name?: string | null): string {
  if (!name) return "?";
  return name.slice(0, 2).toUpperCase();
}

export default function Profile() {
  usePresenceSection(null);
  const params = useParams();
  const userId = params.userId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "likes" ? "likes" : "favorites";
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading } = useGetUser(userId);
  const toggleFollow = useToggleFollow();
  const followersQuery = useListFollowers(userId);
  const followingQuery = useListFollowing(userId);
  const [listOpen, setListOpen] = useState<null | "followers" | "following">(null);

  function handleFollow() {
    if (!profile) return;
    toggleFollow.mutate(
      { userId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
          qc.invalidateQueries({ queryKey: [`/api/users/${userId}/followers`] });
          qc.invalidateQueries({ queryKey: [`/api/users/${userId}/following`] });
        },
        onError: () =>
          toast({
            title: "Couldn't update follow",
            description: "Please try again.",
            variant: "destructive",
          }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        This user could not be found.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden relative">
        {profile.bannerUrl && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${profile.bannerUrl})` }}
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20 ring-4 ring-background" data-testid="avatar-profile">
            <AvatarImage src={profile.avatarUrl ?? undefined} />
            <AvatarFallback className="text-lg">{initials(profile.username)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]" data-testid="text-profile-name">
              {profile.displayName || `@${profile.username}`}
            </h2>
            <p className="truncate text-sm text-[hsl(46,65%,55%)]">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-2 text-sm text-foreground/90" data-testid="text-profile-bio">
                {profile.bio}
              </p>
            )}
          </div>
          {profile.isSelf ? (
            <Link href="/settings">
              <Button variant="outline" data-testid="button-edit-profile">
                Edit profile
              </Button>
            </Link>
          ) : (
            <Button
              onClick={handleFollow}
              disabled={toggleFollow.isPending}
              variant={profile.isFollowing ? "outline" : "default"}
              data-testid="button-toggle-follow"
            >
              {profile.isFollowing ? (
                <>
                  <UserCheck className="mr-2 h-4 w-4" /> Following
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" /> Follow
                </>
              )}
            </Button>
          )}
        </div>

        <div className="mt-6 flex gap-6 text-sm">
          <button
            type="button"
            className="hover-elevate active-elevate-2 rounded-md px-2 py-1"
            onClick={() => setListOpen("followers")}
            data-testid="button-show-followers"
          >
            <span className="font-semibold">{profile.followerCount}</span>{" "}
            <span className="text-muted-foreground">
              {profile.followerCount === 1 ? "follower" : "followers"}
            </span>
          </button>
          <button
            type="button"
            className="hover-elevate active-elevate-2 rounded-md px-2 py-1"
            onClick={() => setListOpen("following")}
            data-testid="button-show-following"
          >
            <span className="font-semibold">{profile.followingCount}</span>{" "}
            <span className="text-muted-foreground">following</span>
          </button>
          <div className="px-2 py-1">
            <span className="font-semibold">{profile.clipCount}</span>{" "}
            <span className="text-muted-foreground">
              {profile.clipCount === 1 ? "clip" : "clips"}
            </span>
          </div>
        </div>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (value === "likes") next.set("tab", "likes");
              else next.delete("tab");
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="favorites" data-testid="tab-favorites">
            <Bookmark className="mr-2 h-4 w-4" /> Favourites
          </TabsTrigger>
          <TabsTrigger value="likes" data-testid="tab-likes">
            <Heart className="mr-2 h-4 w-4" /> Liked
          </TabsTrigger>
        </TabsList>
        <TabsContent value="favorites" className="mt-4">
          <FavoritesList userId={userId} />
        </TabsContent>
        <TabsContent value="likes" className="mt-4">
          <LikesList userId={userId} />
        </TabsContent>
      </Tabs>

      <Dialog open={listOpen !== null} onOpenChange={(open) => !open && setListOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{listOpen === "following" ? "Following" : "Followers"}</DialogTitle>
          </DialogHeader>
          {listOpen === "followers" && (
            <FollowList
              query={followersQuery}
              emptyText="No followers yet."
              onNavigate={() => setListOpen(null)}
            />
          )}
          {listOpen === "following" && (
            <FollowList
              query={followingQuery}
              emptyText="Not following anyone yet."
              onNavigate={() => setListOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClipCollection({
  data,
  isLoading,
  emptyText,
  testId,
}: {
  data: MediaClip[] | undefined;
  isLoading: boolean;
  emptyText: string;
  testId: string;
}) {
  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" data-testid={testId}>
        {emptyText}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((clip) => (
        <ClipCard key={clip.id} clip={clip} />
      ))}
    </div>
  );
}

function FavoritesList({ userId }: { userId: string }) {
  const { data, isLoading } = useListUserFavorites(userId);
  return (
    <ClipCollection
      data={data}
      isLoading={isLoading}
      emptyText="No favourited clips yet."
      testId="text-empty-favorites"
    />
  );
}

function LikesList({ userId }: { userId: string }) {
  const { data, isLoading } = useListUserLikes(userId);
  return (
    <ClipCollection
      data={data}
      isLoading={isLoading}
      emptyText="No liked clips yet."
      testId="text-empty-likes"
    />
  );
}

function FollowList({
  query,
  emptyText,
  onNavigate,
}: {
  query: { data: User[] | undefined; isLoading: boolean };
  emptyText: string;
  onNavigate: () => void;
}) {
  const { data, isLoading } = query;

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
    );
  }

  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto">
      {data.map((u) => (
        <li key={u.id}>
          <Link
            href={`/u/${u.id}`}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md p-2 hover-elevate active-elevate-2"
            data-testid={`link-follow-user-${u.username}`}
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={u.avatarUrl ?? undefined} />
              <AvatarFallback>{initials(u.username)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {u.displayName || `@${u.username}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
