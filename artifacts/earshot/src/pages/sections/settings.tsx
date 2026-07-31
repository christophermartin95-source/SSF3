import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { UserProfile } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import {
  useGetMe,
  useUpdateMe,
  useGetUser,
  useListMediaFavorites,
  useToggleMediaFavorite,
  checkUsernameAvailability,
  type User,
} from "@workspace/api-client-react";
import { usePresenceSection } from "@/lib/realtime";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarUpload } from "@/components/avatar-upload";
import { AudioPlayer } from "@/components/audio-player";
import { isVideoFormat } from "@/lib/media";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, Bookmark, Heart, Play, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

export default function Settings() {
  usePresenceSection(null);
  const { data: me, isLoading } = useGetMe();

  if (isLoading || !me) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Account settings</h2>
        <p className="text-sm text-[hsl(46,65%,55%)]">
          Manage your public profile and account security.
        </p>
      </div>

      <ProfileCard user={me} />

      <FavoritesCard />

      <Card>
        <CardHeader>
          <CardTitle>Account &amp; security</CardTitle>
          <CardDescription>
            Change your password, email, connected accounts, and active devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserProfile
            routing="hash"
            appearance={{
              theme: shadcn,
              elements: {
                rootBox: "w-full",
                cardBox:
                  "w-full max-w-full !shadow-none !border !border-border !rounded-xl !bg-transparent",
                navbar: "!bg-transparent",
                scrollBox: "!bg-transparent",
              },
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FavoritesCard() {
  const { data: favorites, isLoading } = useListMediaFavorites();
  const toggleFavorite = useToggleMediaFavorite();
  const qc = useQueryClient();

  function handleRemove(mediaId: number) {
    toggleFavorite.mutate(
      { mediaId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/media/favorites"] });
          qc.invalidateQueries({ queryKey: ["/api/media"] });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bookmark className="h-5 w-5" /> Your favourites
        </CardTitle>
        <CardDescription>
          Clips you&apos;ve bookmarked. Only you can see this collection.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !favorites || favorites.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-favorites">
            You haven&apos;t favourited any clips yet. Tap the bookmark on a clip to save it here.
          </p>
        ) : (
          <ul className="space-y-4">
            {favorites.map((clip) => (
              <li
                key={clip.id}
                className="media-card-red rounded-lg p-4"
                data-testid={`card-favorite-${clip.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-medium">{clip.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {clip.username ? `@${clip.username}` : "Deleted user"} ·{" "}
                      {formatDistanceToNow(new Date(clip.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleRemove(clip.id)}
                    data-testid={`button-remove-favorite-${clip.id}`}
                  >
                    <Bookmark className="h-4 w-4 fill-primary text-primary" />
                  </Button>
                </div>

                {clip.locked ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4" /> Archived — subscribe to listen.
                  </div>
                ) : clip.objectPath ? (
                  <div className="mt-3">
                    <AudioPlayer
                      src={`/api/storage${clip.objectPath}`}
                      isVideo={isVideoFormat(clip.audioFormat)}
                      poster={clip.thumbnailPath ? `/api/storage${clip.thumbnailPath}` : undefined}
                      testId={`audio-favorite-${clip.id}`}
                    />
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Heart className="h-4 w-4" />
                    {clip.likeCount}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Play className="h-4 w-4" />
                    {clip.playCount}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FollowStats({ userId }: { userId: string }) {
  const { data: profile } = useGetUser(userId);
  if (!profile) return null;
  return (
    <Link href={`/u/${userId}`}>
      <div
        className="flex cursor-pointer gap-6 rounded-md border border-border p-3 text-sm hover-elevate active-elevate-2"
        data-testid="link-my-public-profile"
      >
        <div>
          <span className="font-semibold">{profile.followerCount}</span>{" "}
          <span className="text-muted-foreground">
            {profile.followerCount === 1 ? "follower" : "followers"}
          </span>
        </div>
        <div>
          <span className="font-semibold">{profile.followingCount}</span>{" "}
          <span className="text-muted-foreground">following</span>
        </div>
        <div className="ml-auto text-muted-foreground">View public profile →</div>
      </div>
    </Link>
  );
}

function ProfileCard({ user }: { user: User }) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(user.bannerUrl ?? null);
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">(
    "idle",
  );
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMe = useUpdateMe();

  useEffect(() => {
    if (username === user.username || username.length < 3) {
      setAvailability("idle");
      return;
    }
    let cancelled = false;
    setAvailability("checking");
    const handle = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability({ username });
        if (!cancelled) setAvailability(result.available ? "available" : "taken");
      } catch {
        if (!cancelled) setAvailability("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [username, user.username]);

  const usernameValid =
    username.length >= 3 && (username === user.username || availability === "available");

  const dirty =
    username !== user.username ||
    displayName !== (user.displayName ?? "") ||
    bio !== (user.bio ?? "") ||
    (avatarUrl ?? null) !== (user.avatarUrl ?? null) ||
    (bannerUrl ?? null) !== (user.bannerUrl ?? null);

  async function handleSave() {
    if (!usernameValid) return;
    try {
      await updateMe.mutateAsync({
        data: {
          username,
          displayName: displayName || undefined,
          bio: bio || undefined,
          avatarUrl: avatarUrl ?? undefined,
          bannerUrl: bannerUrl ?? undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast({ title: "Profile saved" });
    } catch (err) {
      toast({
        title: "Couldn't save profile",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>This is how you appear to the rest of the community.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FollowStats userId={user.id} />

        <AvatarUpload
          value={avatarUrl}
          fallback={initials(username || user.username)}
          onChange={setAvatarUrl}
        />

        <div className="space-y-1.5">
          <Label>Profile banner</Label>
          <div className="flex items-center gap-4">
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Banner preview"
                className="h-16 w-32 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-16 w-32 items-center justify-center rounded-md border border-dashed border-border bg-muted text-xs text-muted-foreground">
                No banner
              </div>
            )}
            <AvatarUpload
              value={bannerUrl}
              fallback=""
              onChange={setBannerUrl}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-username">Username</Label>
          <Input
            id="settings-username"
            value={username}
            onChange={(e) => setUsername(sanitize(e.target.value))}
            placeholder="username"
            data-testid="input-settings-username"
          />
          {username !== user.username && username.length >= 3 && (
            <p className="flex items-center gap-1 text-xs">
              {availability === "checking" && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking availability…
                </span>
              )}
              {availability === "available" && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-3 w-3" /> Available
                </span>
              )}
              {availability === "taken" && (
                <span className="flex items-center gap-1 text-destructive">
                  <X className="h-3 w-3" /> Already taken
                </span>
              )}
            </p>
          )}
          {username.length > 0 && username.length < 3 && (
            <p className="text-xs text-muted-foreground">
              Usernames must be at least 3 characters.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-display-name">Display name</Label>
          <Input
            id="settings-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we address you?"
            data-testid="input-settings-display-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-bio">Bio</Label>
          <Textarea
            id="settings-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people a bit about what you share"
            rows={3}
            data-testid="input-settings-bio"
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!dirty || !usernameValid || updateMe.isPending}
            data-testid="button-save-settings-profile"
          >
            {updateMe.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
