import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useListMediaComments,
  useCreateMediaComment,
  useListLiveSessionComments,
  useCreateLiveSessionComment,
  useDeleteComment,
  useToggleCommentUpvote,
  useToggleCommentPin,
  type Comment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MessageCircle, Send, Trash2, ChevronDown, ChevronUp, ArrowBigUp, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function formatWhen(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function CommentRow({ comment, canPin }: { comment: Comment; canPin: boolean }) {
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const deleteComment = useDeleteComment();
  const toggleUpvote = useToggleCommentUpvote();
  const togglePin = useToggleCommentPin();
  const isOwner = user?.id === comment.userId;

  const queryKey = [
    comment.targetType === "media"
      ? `/api/media/${comment.targetId}/comments`
      : `/api/live/sessions/${comment.targetId}/comments`,
  ];

  function handleDelete() {
    deleteComment.mutate(
      { commentId: comment.id },
      { onSuccess: () => qc.invalidateQueries({ queryKey }) },
    );
  }

  function handleUpvote() {
    toggleUpvote.mutate(
      { commentId: comment.id },
      { onSuccess: () => qc.invalidateQueries({ queryKey }) },
    );
  }

  function handleTogglePin() {
    togglePin.mutate(
      { commentId: comment.id },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey }),
        onError: (err) =>
          toast({
            title: "Couldn't update pin",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 py-1.5",
        comment.pinned && "rounded-md bg-muted/50 px-1.5 -mx-1.5",
      )}
      data-testid={`row-comment-${comment.id}`}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <button
          className={cn(
            "mt-0.5 flex flex-col items-center gap-0 shrink-0 rounded-md px-1 py-0.5 hover-elevate active-elevate-2",
            comment.upvotedByMe && "text-primary",
          )}
          onClick={handleUpvote}
          disabled={toggleUpvote.isPending}
          data-testid={`button-upvote-comment-${comment.id}`}
        >
          <ArrowBigUp className={cn("h-4 w-4", comment.upvotedByMe && "fill-current")} />
          <span className="text-[10px] leading-none tabular-nums">{comment.upvoteCount}</span>
        </button>
        <div className="min-w-0">
          <p className="text-sm flex items-center gap-1">
            {comment.pinned && <Pin className="h-3 w-3 text-primary fill-current" />}
            <span className="font-medium">
              {comment.username ? `@${comment.username}` : "Deleted user"}
            </span>{" "}
            <span className="text-muted-foreground">{formatWhen(comment.createdAt)}</span>
          </p>
          <p className="text-sm break-words" data-testid={`text-comment-content-${comment.id}`}>
            {comment.content}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {canPin && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 text-muted-foreground hover:text-primary",
              comment.pinned && "text-primary",
            )}
            onClick={handleTogglePin}
            disabled={togglePin.isPending}
            data-testid={`button-pin-comment-${comment.id}`}
          >
            <Pin className={cn("h-3.5 w-3.5", comment.pinned && "fill-current")} />
          </Button>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            data-testid={`button-delete-comment-${comment.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function CommentSection({
  targetType,
  targetId,
  canPin = false,
}: {
  targetType: "media" | "live_session";
  targetId: number;
  canPin?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mediaComments = useListMediaComments<Comment[]>(targetId, {
    query: {
      queryKey: [`/api/media/${targetId}/comments`],
      enabled: expanded && targetType === "media",
    },
  });
  const liveComments = useListLiveSessionComments<Comment[]>(targetId, {
    query: {
      queryKey: [`/api/live/sessions/${targetId}/comments`],
      enabled: expanded && targetType === "live_session",
    },
  });

  const createMediaComment = useCreateMediaComment();
  const createLiveComment = useCreateLiveSessionComment();

  const { data: comments, isLoading } =
    targetType === "media" ? mediaComments : liveComments;

  const queryKey =
    targetType === "media"
      ? [`/api/media/${targetId}/comments`]
      : [`/api/live/sessions/${targetId}/comments`];

  const isSubmitting = createMediaComment.isPending || createLiveComment.isPending;

  async function handleSubmit() {
    const content = draft.trim();
    if (!content) return;
    try {
      if (targetType === "media") {
        await createMediaComment.mutateAsync({ mediaId: targetId, data: { content } });
      } else {
        await createLiveComment.mutateAsync({ sessionId: targetId, data: { content } });
      }
      qc.invalidateQueries({ queryKey });
      setDraft("");
    } catch (err) {
      toast({
        title: "Couldn't post comment",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate active-elevate-2 rounded-md px-2 py-1"
        onClick={() => setExpanded((e) => !e)}
        data-testid={`button-toggle-comments-${targetType}-${targetId}`}
      >
        <MessageCircle className="h-4 w-4" />
        {expanded ? "Hide comments" : "Comments"}
        {comments && comments.length > 0 && <span>({comments.length})</span>}
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 px-2">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}

          {!isLoading && comments?.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}

          {!isLoading && comments && comments.length > 0 && (
            <div className="max-h-64 space-y-1 overflow-y-auto divide-y divide-border">
              {comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} canPin={canPin} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              data-testid={`input-comment-${targetType}-${targetId}`}
            />
            <Button
              size="icon"
              disabled={!draft.trim() || isSubmitting}
              onClick={handleSubmit}
              data-testid={`button-submit-comment-${targetType}-${targetId}`}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
