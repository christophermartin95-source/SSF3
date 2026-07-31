import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  useListConversations,
  useListMessages,
  useSendMessage,
  useListUsers,
  useBroadcastMessage,
  useGetMe,
  getListMessagesQueryKey,
  getListConversationsQueryKey,
  type DirectMessage,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePresenceSection, useRealtime } from "@/lib/realtime";
import { SectionPresence } from "@/components/section-presence";
import { Link } from "wouter";
import { Send, MessageCircle, UserPlus, Megaphone, Loader2, Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function NewConversationDialog({ onSelect }: { onSelect: (userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: users } = useListUsers(search ? { search } : undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" data-testid="button-new-conversation">
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Start a conversation</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search usernames…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-user-search"
        />
        <ScrollArea className="h-64">
          <div className="space-y-1">
            {users?.map((u) => (
              <button
                key={u.id}
                className="flex w-full items-center gap-3 rounded-md p-2 text-left hover-elevate active-elevate-2"
                onClick={() => { onSelect(u.id); setOpen(false); }}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatarUrl ?? undefined} />
                  <AvatarFallback>{initials(u.username)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">@{u.username}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function BroadcastDialog() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const broadcast = useBroadcastMessage();

  async function handleBroadcast() {
    const trimmed = content.trim();
    if (!trimmed) return;
    const result = await broadcast.mutateAsync({ data: { content: trimmed } });
    setContent("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["/api/conversations"] });
    toast({
      title: "Message sent",
      description: `Delivered to ${result.recipientCount} ${
        result.recipientCount === 1 ? "user" : "users"
      }.`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-broadcast">
          <Megaphone className="h-4 w-4" />
          Send to all
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to all users</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This message will be delivered as a direct message to every other user.
        </p>
        <Textarea
          placeholder="Write your announcement…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          data-testid="input-broadcast-content"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleBroadcast}
            disabled={!content.trim() || broadcast.isPending}
            className="gap-2"
            data-testid="button-send-broadcast"
          >
            {broadcast.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Megaphone className="h-4 w-4" />
            )}
            Send to everyone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Messages() {
  usePresenceSection("messages");
  const { user } = useUser();
  const { subscribe } = useRealtime();
  const qc = useQueryClient();
  const search = useSearch();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  useEffect(() => {
    const target = new URLSearchParams(search).get("user");
    if (target) setActiveUserId(target);
  }, [search]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useListConversations();
  const { data: messages } = useListMessages(activeUserId ?? "", {
    query: {
      enabled: !!activeUserId,
      queryKey: getListMessagesQueryKey(activeUserId ?? ""),
    },
  });
  const sendMessage = useSendMessage();

  const active = conversations?.find((c) => c.userId === activeUserId);

  useEffect(() => {
    const unsubscribe = subscribe("message:new", (msg) => {
      const message = (msg as { message: DirectMessage }).message;
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (message.senderId === activeUserId || message.recipientId === activeUserId) {
        qc.invalidateQueries({ queryKey: getListMessagesQueryKey(activeUserId ?? "") });
      }
    });
    return unsubscribe;
  }, [subscribe, qc, activeUserId]);

  useEffect(() => {
    const unsubscribe = subscribe("message:read", (msg) => {
      const readerId = (msg as unknown as { readerId: string }).readerId;
      if (readerId === activeUserId) {
        qc.invalidateQueries({ queryKey: getListMessagesQueryKey(activeUserId ?? "") });
      }
    });
    return unsubscribe;
  }, [subscribe, qc, activeUserId]);

  useEffect(() => {
    if (activeUserId && messages) {
      qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    }
  }, [activeUserId, messages, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    if (!activeUserId || !draft.trim()) return;
    await sendMessage.mutateAsync({ userId: activeUserId, data: { content: draft.trim() } });
    setDraft("");
    qc.invalidateQueries({ queryKey: getListMessagesQueryKey(activeUserId ?? "") });
    qc.invalidateQueries({ queryKey: ["/api/conversations"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Messages</h2>
          <p className="text-sm text-[hsl(46,65%,55%)]">Direct message anyone in the community.</p>
        </div>
        {isAdmin && <BroadcastDialog />}
      </div>

      <SectionPresence section="messages" />

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card className="flex flex-col p-0">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-medium">Conversations</span>
            <NewConversationDialog onSelect={setActiveUserId} />
          </div>
          <ScrollArea className="h-[480px]">
            {conversations?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
            )}
            {conversations?.map((c) => (
              <button
                key={c.userId}
                className={`flex w-full items-start gap-3 border-b border-border/50 p-3 text-left hover-elevate active-elevate-2 ${
                  activeUserId === c.userId ? "bg-accent" : ""
                }`}
                onClick={() => setActiveUserId(c.userId)}
                data-testid={`button-conversation-${c.username}`}
              >
                <Link href={`/u/${c.userId}`} onClick={(e) => e.stopPropagation()}>
                  <Avatar className="h-9 w-9 cursor-pointer">
                    <AvatarImage src={c.avatarUrl ?? undefined} />
                    <AvatarFallback>{initials(c.username)}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.displayName || `@${c.username}`}
                    </span>
                    {c.unreadCount > 0 && (
                      <Badge className="h-5 min-w-5 justify-center px-1">{c.unreadCount}</Badge>
                    )}
                  </div>
                  {c.lastMessage && (
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                  )}
                </div>
              </button>
            ))}
          </ScrollArea>
        </Card>

        <Card className="flex flex-col p-0">
          {!activeUserId ? (
            <div className="flex h-[480px] flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-8 w-8" />
              <p className="text-sm">Pick a conversation to start chatting</p>
            </div>
          ) : (
            <>
              <div className="border-b border-border p-3">
                <span className="text-sm font-medium">
                  {active?.displayName || `@${active?.username ?? ""}`}
                </span>
              </div>
              <ScrollArea className="h-[420px] p-3" ref={scrollRef}>
                <div className="space-y-2">
                  {messages?.map((m) => {
                    const mine = m.senderId === user?.id;
                    return (
                      <div
                        key={m.id}
                        className="flex justify-start"
                        data-testid={`message-${m.id}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                            mine
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          <p>{m.content}</p>
                          <div className="mt-1 flex items-center justify-start gap-1.5 text-[10px]">
                            <span className="opacity-70">
                              {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                            </span>
                            {mine && (
                              <span
                                className={`flex items-center gap-1 font-medium ${
                                  m.readAt ? "text-[hsl(46,65%,55%)]" : "opacity-70"
                                }`}
                                data-testid={`message-status-${m.id}`}
                                title={m.readAt ? "Read" : "Sent"}
                              >
                                {m.readAt ? (
                                  <Avatar className="h-3.5 w-3.5">
                                    <AvatarImage src={active?.avatarUrl ?? undefined} />
                                    <AvatarFallback className="text-[8px]">
                                      {initials(active?.username ?? "?")}
                                    </AvatarFallback>
                                  </Avatar>
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="flex items-center gap-2 border-t border-border p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  data-testid="input-message-draft"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!draft.trim() || sendMessage.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
