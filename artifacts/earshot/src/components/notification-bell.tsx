import { useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Heart, Music, MessageCircle } from "lucide-react";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { useRealtime } from "@/lib/realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function notificationText(n: Notification): string {
  const actor = n.actorDisplayName || (n.actorUsername ? `@${n.actorUsername}` : "Someone");
  if (n.type === "media_liked") {
    return `${actor} liked your sound "${n.mediaTitle ?? "a clip"}"`;
  }
  if (n.type === "direct_message") {
    return n.mediaTitle
      ? `${actor} messaged you: "${n.mediaTitle}"`
      : `${actor} sent you a message`;
  }
  return `${actor} shared a new sound: "${n.mediaTitle ?? "a clip"}"`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function NotificationBell() {
  const { data: notifications } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { subscribe } = useRealtime();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  useEffect(() => {
    const unsubscribe = subscribe("notification:new", () => {
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    });
    return unsubscribe;
  }, [subscribe, qc]);

  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.read).length,
    [notifications],
  );

  function handleItemClick(n: Notification) {
    if (!n.read) {
      markRead.mutate(
        { notificationId: n.id },
        {
          onSuccess: () =>
            qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
        },
      );
    }
    if (n.type === "direct_message") {
      navigate(n.actorId ? `/messages?user=${n.actorId}` : "/messages");
    } else if (n.mediaId != null) {
      navigate("/overheard");
    }
  }

  function handleMarkAll() {
    markAllRead.mutate(undefined, {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    });
  }

  const items = notifications ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover-elevate active-elevate-2"
          aria-label="Notifications"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5 text-[#B8860B]" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={handleMarkAll}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover-elevate active-elevate-2 ${
                      n.read ? "" : "bg-accent/40"
                    }`}
                    data-testid={`notification-item-${n.id}`}
                  >
                    <div className="relative">
                      <Link href={`/u/${n.actorId ?? ""}`}>
                        <Avatar className="h-8 w-8 cursor-pointer hover-elevate active-elevate-2">
                          <AvatarImage src={n.actorAvatarUrl ?? undefined} />
                          <AvatarFallback>
                            {initials(n.actorUsername ?? "??")}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card">
                        {n.type === "media_liked" ? (
                          <Heart className="h-3 w-3 text-primary" />
                        ) : n.type === "direct_message" ? (
                          <MessageCircle className="h-3 w-3 text-primary" />
                        ) : (
                          <Music className="h-3 w-3 text-primary" />
                        )}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{notificationText(n)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
