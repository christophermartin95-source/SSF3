import { useState } from "react";
import { Link } from "wouter";
import { useListUsers, useListOnlineUsers } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePresenceSection } from "@/lib/realtime";
import { Search, Headphones, Mic, Radio, MessageCircle, Users as UsersIcon } from "lucide-react";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

const sectionLabel: Record<string, { label: string; icon: typeof Headphones }> = {
  overheard: { label: "Browsing Share Overheard Sounds", icon: Headphones },
  self_recorded: { label: "Browsing Share Self Recorded Sounds", icon: Mic },
  go_live: { label: "In Go Live To Share With The Commumity", icon: Radio },
  messages: { label: "In Messages", icon: MessageCircle },
};

export default function People() {
  usePresenceSection(null);
  const [search, setSearch] = useState("");
  const { data: onlineUsers } = useListOnlineUsers();
  const { data: users } = useListUsers(search ? { search } : undefined);

  const onlineIds = new Set((onlineUsers ?? []).map((u) => u.userId));
  const onlineDetails = new Map((onlineUsers ?? []).map((u) => [u.userId, u]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Users</h2>
        <p className="text-sm text-[hsl(46,65%,55%)]">SSF community</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-people-search"
        />
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Online now ({onlineUsers?.length ?? 0})
        </h3>
        {(!onlineUsers || onlineUsers.length === 0) && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No one else is online right now.
          </Card>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {onlineUsers?.map((u) => {
            const meta = u.section ? sectionLabel[u.section] : null;
            const Icon = meta?.icon ?? UsersIcon;
            return (
              <Link key={u.userId} href={`/u/${u.userId}`}>
                <Card className="flex cursor-pointer items-center gap-3 p-3 hover-elevate active-elevate-2" data-testid={`card-online-${u.username}`}>
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatarUrl ?? undefined} />
                    <AvatarFallback>{initials(u.username)}</AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.displayName || `@${u.username}`}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {meta?.label ?? "Online"}
                  </p>
                </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">All members</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {users?.map((u) => {
            const isOnline = onlineIds.has(u.id);
            return (
              <Link key={u.id} href={`/u/${u.id}`}>
                <Card className="flex cursor-pointer items-center gap-3 p-3 hover-elevate active-elevate-2" data-testid={`card-user-${u.username}`}>
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatarUrl ?? undefined} />
                    <AvatarFallback>{initials(u.username)}</AvatarFallback>
                  </Avatar>
                  {isOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.displayName || `@${u.username}`}</p>
                  <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                </div>
                {isOnline && <Badge variant="outline" className="shrink-0">Online</Badge>}
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
