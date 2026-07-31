import {
  useAdminListUsers,
  useAdminSetUserRole,
  useAdminGetStats,
  useGetMe,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, Users, Mic, Radio, MessageSquare } from "lucide-react";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function Admin() {
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const { data: stats } = useAdminGetStats();
  const { data: users } = useAdminListUsers();
  const setRole = useAdminSetUserRole({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      },
    },
  });

  if (me && me.role !== "admin") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        You don't have access to this page.
      </Card>
    );
  }

  const statCards = [
    { label: "Users", value: stats?.userCount, icon: Users, path: "/people" },
    { label: "Clips", value: stats?.mediaCount, icon: Mic, path: "/overheard" },
    { label: "Live sessions", value: stats?.liveSessionCount, icon: Radio, path: "/go-live" },
    { label: "Comments", value: stats?.commentCount, icon: MessageSquare, path: "/chat" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(46,65%,55%)]">Admin</h2>
        <p className="text-sm text-[hsl(46,65%,55%)]">Manage users and monitor site activity.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Link key={s.label} href={s.path}>
            <Card className="flex cursor-pointer items-center gap-3 p-4 hover-elevate active-elevate-2" data-testid={`card-stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
              <div className="rounded-md bg-accent p-2">
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">{s.value ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">All users</h3>
        <div className="space-y-2">
          {users?.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-3" data-testid={`card-admin-user-${u.username}`}>
              <Link href={`/u/${u.id}`}>
                <Avatar className="h-9 w-9 cursor-pointer hover-elevate active-elevate-2">
                  <AvatarImage src={u.avatarUrl ?? undefined} />
                  <AvatarFallback>{initials(u.username)}</AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/u/${u.id}`} className="truncate text-sm font-medium hover:underline">
                  {u.displayName || `@${u.username}`}
                </Link>
                <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
              </div>
              {u.role === "admin" ? (
                <Badge className="gap-1 shrink-0" data-testid={`badge-role-${u.username}`}>
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0" data-testid={`badge-role-${u.username}`}>
                  Member
                </Badge>
              )}
              <Button
                size="sm"
                variant={u.role === "admin" ? "outline" : "default"}
                disabled={setRole.isPending || u.id === me?.id}
                onClick={() =>
                  setRole.mutate({
                    userId: u.id,
                    data: { role: u.role === "admin" ? "user" : "admin" },
                  })
                }
                data-testid={`button-toggle-role-${u.username}`}
              >
                <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                {u.role === "admin" ? "Revoke admin" : "Make admin"}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
