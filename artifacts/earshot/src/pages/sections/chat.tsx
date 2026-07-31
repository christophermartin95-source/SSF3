import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useListChatMessages,
  useSendChatMessage,
  useMarkChatMessageRead,
  getListChatMessagesQueryKey,
  type ChatMessage,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AudioPlayer } from "@/components/audio-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { usePresenceSection, useRealtime } from "@/lib/realtime";
import { SectionPresence } from "@/components/section-presence";
import { normalizeAudioFile, saveMediaToDevice, shareMedia } from "@/lib/media";
import { Link } from "wouter";
import { Send, Paperclip, X, Loader2, MessagesSquare, Download, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function formatWhen(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function mediaKind(file: File): "image" | "audio" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function ChatBubble({
  message,
  mine,
  currentUserId,
}: {
  message: ChatMessage;
  mine: boolean;
  currentUserId: string;
}) {
  const name = message.displayName || (message.username ? `@${message.username}` : "Unknown");
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!message.mediaObjectPath) return;
    setSaving(true);
    try {
      const base = message.mediaType === "image" ? "overheard-image" : "overheard-audio";
      await saveMediaToDevice(message.mediaObjectPath, `${base}-${message.id}`);
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
      const result = await shareMedia(
        "chat",
        message.id,
        message.mediaType === "image" ? "Overheard image" : "Overheard audio",
      );
      if (result === "copied") {
        toast({ title: "Link copied", description: "Paste it anywhere to share this." });
      }
    } catch {
      toast({
        title: "Couldn't share",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div
      className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
      data-testid={`chat-message-${message.id}`}
    >
      <Link href={`/u/${message.userId}`}>
        <Avatar className="h-8 w-8 shrink-0 cursor-pointer hover-elevate active-elevate-2">
          <AvatarImage src={message.avatarUrl ?? undefined} />
          <AvatarFallback>{initials(message.username ?? "?")}</AvatarFallback>
        </Avatar>
      </Link>
      <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
        <span className="px-1 text-xs text-muted-foreground">{name}</span>
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          }`}
        >
          {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
          {message.mediaObjectPath && message.mediaType === "image" && (
            <img
              src={`/api/storage${message.mediaObjectPath}`}
              alt="Shared media"
              className="mt-2 max-h-64 rounded-md"
              data-testid={`chat-image-${message.id}`}
            />
          )}
          {message.mediaObjectPath && message.mediaType === "audio" && (
            <AudioPlayer
              className="mt-2"
              src={`/api/storage${message.mediaObjectPath}`}
              testId={`chat-audio-${message.id}`}
            />
          )}
          {message.mediaObjectPath && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-1 text-xs opacity-80 hover-elevate active-elevate-2 rounded px-1.5 py-0.5 ${
                  mine ? "text-primary-foreground" : "text-foreground"
                }`}
                data-testid={`button-save-chat-${message.id}`}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Save
              </button>
              <button
                onClick={handleShare}
                className={`flex items-center gap-1 text-xs opacity-80 hover-elevate active-elevate-2 rounded px-1.5 py-0.5 ${
                  mine ? "text-primary-foreground" : "text-foreground"
                }`}
                data-testid={`button-share-chat-${message.id}`}
              >
                <Share2 className="h-3 w-3" />
                Share
              </button>
            </div>
          )}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground opacity-70">
          {formatWhen(message.createdAt)}
        </span>
        {mine && message.readBy && message.readBy.length > 0 && (
          <div className="flex items-center gap-1.5">
            {message.readBy.slice(0, 3).map((r) => (
              <Avatar className="h-5 w-5 ring-1 ring-background" key={r.userId} title={`Read by ${r.displayName || r.username || "?"}`}>
                <AvatarImage src={r.avatarUrl ?? undefined} />
                <AvatarFallback className="text-[10px]">{initials(r.username ?? "?")}</AvatarFallback>
              </Avatar>
            ))}
            {message.readBy.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{message.readBy.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  usePresenceSection("chat");
  const { user } = useUser();
  const { subscribe } = useRealtime();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useListChatMessages();
  const sendChatMessage = useSendChatMessage();
  const { uploadFile, isUploading } = useUpload({ basePath: "/api/storage" });

  const markChatMessageRead = useMarkChatMessageRead();

  useEffect(() => {
    const unsubscribe = subscribe("chat:new", () => {
      qc.invalidateQueries({ queryKey: getListChatMessagesQueryKey() });
    });
    return unsubscribe;
  }, [subscribe, qc]);

  useEffect(() => {
    const unsubscribe = subscribe("chat:read", (msg) => {
      const data = msg as unknown as {
        messageId: number;
        userId: string;
        username: string | null;
        displayName: string | null;
        avatarUrl: string | null;
      };
      qc.setQueryData<ChatMessage[]>(
        getListChatMessagesQueryKey(),
        (prev) =>
          prev?.map((m) => {
            if (m.id !== data.messageId) return m;
            const already = m.readBy?.some((r) => r.userId === data.userId);
            if (already) return m;
            return { ...m, readBy: [...(m.readBy ?? []), data] };
          }) ?? prev,
      );
    });
    return unsubscribe;
  }, [subscribe, qc]);

  // Mark other users' messages as read when they're rendered.
  // sentReadsRef guards against re-sending while a request is in flight or
  // before the server state round-trips (prevents duplicate read receipts).
  const sentReadsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!messages || !user?.id) return;
    for (const m of messages) {
      if (m.userId === user.id) continue; // skip my own messages
      const already = m.readBy?.some((r) => r.userId === user.id);
      if (already) continue;
      if (sentReadsRef.current.has(m.id)) continue;
      sentReadsRef.current.add(m.id);
      markChatMessageRead.mutate(
        { data: { messageId: m.id } },
        {
          onError: () => {
            sentReadsRef.current.delete(m.id);
          },
        },
      );
    }
  }, [messages, user?.id, markChatMessageRead]);

  // Newest messages are at the top; keep the view anchored near the top
  // so the user sees the latest activity without scrolling.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [messages]);

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text && !file) return;

    try {
      let mediaObjectPath: string | undefined;
      let mediaType: "image" | "audio" | undefined;

      if (file) {
        const toUpload = normalizeAudioFile(file);
        const kind = mediaKind(toUpload);
        if (!kind) {
          toast({
            title: "Unsupported file",
            description: "Only images and audio can be shared.",
            variant: "destructive",
          });
          return;
        }
        const uploaded = await uploadFile(toUpload);
        if (!uploaded) throw new Error("Upload failed");
        mediaObjectPath = uploaded.objectPath;
        mediaType = kind;
      }

      await sendChatMessage.mutateAsync({
        data: {
          content: text || undefined,
          mediaObjectPath,
          mediaType,
        },
      });
      setDraft("");
      clearFile();
      qc.invalidateQueries({ queryKey: getListChatMessagesQueryKey() });
    } catch (err) {
      toast({
        title: "Couldn't send",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  const sending = isUploading || sendChatMessage.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Live Chat</h2>
        <p className="text-sm text-[hsl(46,65%,55%)]">
          Chat live with the community. Share images and audio too.
        </p>
      </div>

      <SectionPresence section="chat" />

      <Card className="flex flex-col p-0">
        <ScrollArea className="h-[480px] p-4" ref={scrollRef}>
          {messages?.length === 0 && (
            <div className="flex h-[440px] flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessagesSquare className="h-8 w-8" />
              <p className="text-sm">No messages yet — say hello!</p>
            </div>
          )}
          <div className="space-y-4">
            {messages?.map((m) => (
              <ChatBubble
                key={m.id}
                message={m}
                mine={m.userId === user?.id}
                currentUserId={user?.id ?? ""}
              />
            ))}
          </div>
        </ScrollArea>

        {file && (
          <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={clearFile}
              className="ml-auto text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
              data-testid="button-remove-attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,.mp3,.mpeg,.mpga,.mpg,.m4a,.m4b,.wav,.aac,.aif,.aiff,.aifc,.caf,.ogg,.oga,.opus,.flac,.webm"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="input-chat-file"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach media"
            data-testid="button-attach-media"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            data-testid="input-chat-draft"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sending || (!draft.trim() && !file)}
            data-testid="button-send-chat"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
