import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMedia,
  useCreateMedia,
  useToggleMediaLike,
  useToggleMediaFavorite,
  useRecordMediaPlay,
  useDeleteMedia,
  useGetMediaFavoriteOfMonth,
  useGetMe,
  useAdminUpdateMedia,
  useAdminDeleteMedia,
  customFetch,
  type MediaClip,
  type MediaSection as MediaSectionType,
  type GetMediaFavoriteOfMonth200,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";
import { Heart, Play, Trash2, Upload, Loader2, Trophy, MessageCircle, Lock, Search, X, Download, Share2, Bookmark } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { CommentSection } from "@/components/comment-section";
import { SectionPresence } from "@/components/section-presence";
import { AudioPlayer } from "@/components/audio-player";
import { PlayHeatmap } from "@/components/play-heatmap";
import {
  normalizeAudioFile,
  canDecodeMedia,
  deriveMediaFormat,
  generateVideoThumbnail,
  isVideoFormat,
  formatLabel,
  saveMediaToDevice,
  shareMedia,
} from "@/lib/media";

function formatWhen(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatDateTime(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "";
  }
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ClipCard({ clip }: { clip: MediaClip }) {
  const { user } = useUser();
  const { data: me } = useGetMe();
  const toggleLike = useToggleMediaLike();
  const toggleFavorite = useToggleMediaFavorite();
  const recordPlay = useRecordMediaPlay();
  const deleteMedia = useDeleteMedia();
  const adminUpdateMedia = useAdminUpdateMedia();
  const adminDeleteMedia = useAdminDeleteMedia();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isOwner = user?.id === clip.userId;
  const isAdmin = me?.role === "admin";

  function handleAdminMove(section: MediaSectionType) {
    if (section === clip.section) return;
    adminUpdateMedia.mutate(
      { mediaId: clip.id, data: { section } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/media"] });
          qc.invalidateQueries({ queryKey: ["/api/media/favorite-of-month"] });
          toast({
            title: "Clip moved",
            description: `Moved to ${section === "overheard" ? "Overheard" : "Self recorded"}.`,
          });
        },
        onError: () =>
          toast({
            title: "Couldn't move clip",
            description: "Please try again.",
            variant: "destructive",
          }),
      },
    );
  }

  function handleAdminDelete() {
    adminDeleteMedia.mutate(
      { mediaId: clip.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/media"] });
          qc.invalidateQueries({ queryKey: ["/api/media/favorite-of-month"] });
        },
        onError: () =>
          toast({
            title: "Couldn't delete clip",
            description: "Please try again.",
            variant: "destructive",
          }),
      },
    );
  }

  function handlePlay() {
    // No-op: tracking is now done via onPlaySegment from AudioPlayer
  }

  function handlePlaySegment(startSecond: number, endSecond: number) {
    customFetch(`/api/media/${clip.id}/play`, {
      method: "POST",
      body: JSON.stringify({ startSecond, endSecond }),
    })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/media"] }))
      .catch(() => {});
  }

  async function handleSave() {
    if (!clip.objectPath) return;
    setSaving(true);
    try {
      await saveMediaToDevice(clip.objectPath, clip.title || `overheard-clip-${clip.id}`);
    } catch {
      toast({
        title: "Couldn't save",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    try {
      const result = await shareMedia("clip", clip.id, clip.title || "Overheard clip");
      if (result === "copied") {
        toast({ title: "Link copied", description: "Paste it anywhere to share this clip." });
      }
    } catch {
      toast({ title: "Couldn't share", description: "Please try again.", variant: "destructive" });
    }
  }

  function handleLike() {
    toggleLike.mutate(
      { mediaId: clip.id },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/media"] }) },
    );
  }

  function handleFavorite() {
    toggleFavorite.mutate(
      { mediaId: clip.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/media"] });
          qc.invalidateQueries({ queryKey: ["/api/media/favorites"] });
        },
      },
    );
  }

  function handleDelete() {
    deleteMedia.mutate(
      { mediaId: clip.id },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/media"] }) },
    );
  }

  return (
    <Card className="media-card-red p-4" data-testid={`card-clip-${clip.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {clip.userId ? (
            <Link href={`/u/${clip.userId}`}>
              <Avatar className="h-9 w-9 shrink-0 cursor-pointer hover-elevate active-elevate-2" data-testid={`avatar-clip-${clip.id}`}>
                <AvatarImage src={clip.avatarUrl ?? undefined} />
                <AvatarFallback>{initials(clip.username)}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Avatar className="h-9 w-9 shrink-0" data-testid={`avatar-clip-${clip.id}`}>
              <AvatarImage src={clip.avatarUrl ?? undefined} />
              <AvatarFallback>{initials(clip.username)}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
          <h3 className="truncate font-medium" data-testid={`text-clip-title-${clip.id}`}>
            {clip.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {clip.userId && clip.username ? (
              <Link href={`/u/${clip.userId}`} className="hover:underline">
                @{clip.username}
              </Link>
            ) : (
              clip.username ? `@${clip.username}` : "Deleted user"
            )}{" "}
            · {formatWhen(clip.createdAt)}
          </p>
          <p
            className="text-xs text-muted-foreground/80"
            data-testid={`text-clip-uploaded-${clip.id}`}
          >
            Uploaded {formatDateTime(clip.createdAt)}
          </p>
          </div>
        </div>
        {isOwner && !isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            data-testid={`button-delete-clip-${clip.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={clip.section}
              onValueChange={(value) => handleAdminMove(value as MediaSectionType)}
            >
              <SelectTrigger
                className="h-8 w-[150px]"
                data-testid={`select-move-clip-${clip.id}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overheard">Overheard</SelectItem>
                <SelectItem value="self_recorded">Self recorded</SelectItem>
              </SelectContent>
            </Select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  data-testid={`button-delete-clip-${clip.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this clip?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes "{clip.title}" for everyone. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid={`button-cancel-delete-clip-${clip.id}`}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleAdminDelete}
                    data-testid={`button-confirm-delete-clip-${clip.id}`}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {clip.description && (
        <p className="mt-1 text-sm text-muted-foreground">{clip.description}</p>
      )}

      {clip.locked ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground"
          data-testid={`locked-clip-${clip.id}`}
        >
          <Lock className="h-4 w-4 shrink-0" />
          This clip has moved to Archives. Get archive access to listen.
        </div>
      ) : (
        <div>
          <AudioPlayer
            className="mt-3"
            onPlay={handlePlay}
            onPlaySegment={handlePlaySegment}
            src={`/api/storage${clip.objectPath}`}
            isVideo={isVideoFormat(clip.audioFormat)}
            poster={clip.thumbnailPath ? `/api/storage${clip.thumbnailPath}` : undefined}
            testId={`audio-clip-${clip.id}`}
          />
          <PlayHeatmap mediaId={clip.id} className="mt-1" />
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
        <button
          className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
          onClick={handleLike}
          data-testid={`button-like-clip-${clip.id}`}
        >
          <Heart className={`h-4 w-4 ${clip.likedByMe ? "fill-primary text-primary" : ""}`} />
          {clip.likeCount}
        </button>
        <button
          className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
          onClick={handleFavorite}
          data-testid={`button-favorite-clip-${clip.id}`}
        >
          <Bookmark className={`h-4 w-4 ${clip.favoritedByMe ? "fill-primary text-primary" : ""}`} />
          {clip.favoritedByMe ? "Saved" : "Favourite"}
        </button>
        <span className="flex items-center gap-1.5">
          <Play className="h-4 w-4" />
          {clip.playCount}
        </span>
        {!clip.locked && (
          <button
            className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
            onClick={handleSave}
            disabled={saving}
            data-testid={`button-save-clip-${clip.id}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Save
          </button>
        )}
        <button
          className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
          onClick={handleShare}
          data-testid={`button-share-clip-${clip.id}`}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        {clip.audioFormat && (
          <span className="uppercase text-xs tracking-wide">{formatLabel(clip.audioFormat)}</span>
        )}
      </div>

      <CommentSection targetType="media" targetId={clip.id} canPin={isOwner} />
    </Card>
  );
}

function FavoriteOfMonthCard({
  favorite,
}: {
  favorite: NonNullable<GetMediaFavoriteOfMonth200>;
}) {
  const { user } = useUser();
  const toggleLike = useToggleMediaLike();
  const recordPlay = useRecordMediaPlay();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isOwner = user?.id === favorite.userId;

  function handlePlay() {
    // No-op: tracking is now done via onPlaySegment from AudioPlayer
  }

  function handlePlaySegment(startSecond: number, endSecond: number) {
    customFetch(`/api/media/${favorite.id}/play`, {
      method: "POST",
      body: JSON.stringify({ startSecond, endSecond }),
    })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/media"] }))
      .catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveMediaToDevice(favorite.objectPath, favorite.title || `overheard-clip-${favorite.id}`);
    } catch {
      toast({
        title: "Couldn't save",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    try {
      const result = await shareMedia("clip", favorite.id, favorite.title || "Overheard clip");
      if (result === "copied") {
        toast({ title: "Link copied", description: "Paste it anywhere to share this clip." });
      }
    } catch {
      toast({ title: "Couldn't share", description: "Please try again.", variant: "destructive" });
    }
  }

  function handleLike() {
    toggleLike.mutate(
      { mediaId: favorite.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/media"] });
          qc.invalidateQueries({ queryKey: ["/api/media/favorite-of-month"] });
        },
      },
    );
  }

  return (
    <Card
      className="media-card-red border-primary/40 p-4"
      data-testid={`card-favorite-of-month-${favorite.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link href={`/u/${favorite.userId}`}>
            <Avatar className="h-9 w-9 shrink-0 cursor-pointer hover-elevate active-elevate-2" data-testid={`avatar-favorite-${favorite.id}`}>
              <AvatarImage src={favorite.avatarUrl ?? undefined} />
              <AvatarFallback>{initials(favorite.username)}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
            <Trophy className="h-3.5 w-3.5" />
            Favorite of the month
          </div>
          <h3
            className="mt-1 truncate font-medium"
            data-testid={`text-favorite-title-${favorite.id}`}
          >
            {favorite.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {favorite.username ? `@${favorite.username}` : "Deleted user"} · {formatWhen(favorite.createdAt)}
          </p>
          <p
            className="text-xs text-muted-foreground/80"
            data-testid={`text-favorite-uploaded-${favorite.id}`}
          >
            Uploaded {formatDateTime(favorite.createdAt)}
          </p>
          </div>
        </div>
      </div>

      {favorite.description && (
        <p className="mt-1 text-sm text-muted-foreground">{favorite.description}</p>
      )}

      <div>
        <AudioPlayer
          className="mt-3"
          onPlay={handlePlay}
          onPlaySegment={handlePlaySegment}
          src={`/api/storage${favorite.objectPath}`}
          isVideo={isVideoFormat(favorite.audioFormat)}
          poster={favorite.thumbnailPath ? `/api/storage${favorite.thumbnailPath}` : undefined}
          testId={`audio-favorite-${favorite.id}`}
        />
        <PlayHeatmap mediaId={favorite.id} className="mt-1" />
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
        <button
          className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
          onClick={handleLike}
          data-testid={`button-like-favorite-${favorite.id}`}
        >
          <Heart className={`h-4 w-4 ${favorite.likedByMe ? "fill-primary text-primary" : ""}`} />
          {favorite.likeCount}
        </button>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" />
          {favorite.commentCount}
        </span>
        <span className="flex items-center gap-1.5">
          <Play className="h-4 w-4" />
          {favorite.playCount}
        </span>
        <button
          className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
          onClick={handleSave}
          disabled={saving}
          data-testid={`button-save-favorite-${favorite.id}`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Save
        </button>
        <button
          className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1"
          onClick={handleShare}
          data-testid={`button-share-favorite-${favorite.id}`}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <span className="uppercase text-xs tracking-wide">{formatLabel(favorite.audioFormat)}</span>
      </div>

      <CommentSection targetType="media" targetId={favorite.id} canPin={isOwner} />
    </Card>
  );
}

function UploadClipDialog({ section }: { section: MediaSectionType }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({ basePath: "/api/storage" });
  const createMedia = useCreateMedia();
  const qc = useQueryClient();
  const { toast } = useToast();

  function reset() {
    setTitle("");
    setDescription("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!file || !title.trim()) return;
    try {
      const audioFile = normalizeAudioFile(file);
      const playable = await canDecodeMedia(audioFile);
      if (!playable) {
        toast({
          title: "Can't use this file",
          description:
            "We couldn't play this file. Try an MP3, WAV, M4A, or an MP4/MOV video.",
          variant: "destructive",
        });
        return;
      }
      const uploaded = await uploadFile(audioFile);
      if (!uploaded) throw new Error("Upload failed");
      const audioFormat = deriveMediaFormat(audioFile);

      let thumbnailPath: string | undefined;
      if (isVideoFormat(audioFormat)) {
        const thumb = await generateVideoThumbnail(audioFile);
        if (thumb) {
          const uploadedThumb = await uploadFile(thumb);
          thumbnailPath = uploadedThumb?.objectPath;
        }
      }

      await createMedia.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          section,
          audioFormat,
          objectPath: uploaded.objectPath,
          thumbnailPath,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: "Uploaded!", description: `"${title.trim()}" is now live.` });
      reset();
      setOpen(false);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid={`button-upload-${section}`}>
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload audio</DialogTitle>
          <DialogDescription>
            {section === "overheard"
              ? "Share something interesting you overheard."
              : "Share a recording you made yourself."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clip-title">Title</Label>
            <Input
              id="clip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give it a name"
              data-testid="input-clip-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clip-description">Description (optional)</Label>
            <Input
              id="clip-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A little context"
              data-testid="input-clip-description"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clip-file">Audio or video file</Label>
            <Input
              id="clip-file"
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/webm,video/quicktime,video/ogg,video/3gpp,.mp3,.mpeg,.mpga,.mpg,.m4a,.m4b,.wav,.aac,.aif,.aiff,.aifc,.caf,.ogg,.oga,.opus,.flac,.webm,.mp4,.m4v,.mov,.ogv,.3gp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="input-clip-file"
            />
            <p className="text-xs text-muted-foreground">
              MP3, WAV, M4A, OGG, FLAC, MP4, MOV — audio and video welcome.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || isUploading || createMedia.isPending}
            className="w-full gap-2"
            data-testid="button-submit-upload"
          >
            {isUploading || createMedia.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isUploading ? "Uploading…" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MediaSectionView({
  section,
  title,
  description,
  archived = false,
  bannerSrc,
}: {
  section: MediaSectionType;
  title: string;
  description: string;
  archived?: boolean;
  bannerSrc?: string;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "popular" | "oldest">("newest");

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data: clips, isLoading } = useListMedia({
    section,
    ...(archived ? { archived: true } : {}),
    ...(search ? { search } : {}),
    sort,
  });
  const { data: favorite } = useGetMediaFavoriteOfMonth(
    { section },
    { query: { enabled: !archived, queryKey: ["/api/media/favorite-of-month", section] } },
  );

  return (
    <div className="space-y-5">
      {bannerSrc && (
        <>
          <h2 className="sr-only">{title}</h2>
          <img
            src={bannerSrc}
            alt={title}
            className="-mx-4 w-[calc(100%+2rem)] max-w-none rounded-none object-cover object-center shadow-lg md:mx-0 md:w-full md:rounded-lg"
            data-testid="img-section-banner"
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!archived && <UploadClipDialog section={section} />}
        {!bannerSrc && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">{title}</h2>
            <p className="text-sm text-[hsl(46,65%,55%)]">{description}</p>
          </div>
        )}
      </div>

      {!archived && <SectionPresence section={section} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search titles…"
            className="pl-8 pr-8"
            data-testid={`input-search-${section}${archived ? "-archived" : ""}`}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              data-testid={`button-clear-search-${section}${archived ? "-archived" : ""}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger
            className="w-40"
            data-testid={`select-sort-${section}${archived ? "-archived" : ""}`}
          >
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="popular">Most popular</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!archived && !search && favorite && <FavoriteOfMonthCard favorite={favorite} />}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && clips?.length === 0 && (
        <Card className="media-card-red p-10 text-center text-muted-foreground">
          {search
            ? `No clips found matching "${search}".`
            : archived
              ? "No archived clips yet — check back after 3 months."
              : "Nothing here yet — be the first to upload."}
        </Card>
      )}

      {!isLoading && clips && clips.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </div>
  );
}
