import { Link } from "wouter";
import { useRealtime } from "@/lib/realtime";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Shows the users currently present in a given section as a live list of
 * avatars with their usernames. Reads the realtime presence snapshot and
 * filters to the section, so it updates automatically as people come and go.
 * Renders nothing when the section is empty.
 */
export function SectionPresence({ section }: { section: string }) {
  const { presence } = useRealtime();
  const here = presence.filter((p) => p.section === section);

  if (here.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/50 px-3 py-2"
      data-testid={`section-presence-${section}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
      <span className="text-xs font-medium text-muted-foreground">
        Here now ({here.length})
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {here.map((p) => (
          <Link
            key={p.userId}
            href={`/u/${p.userId}`}
            className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs hover:bg-muted/80"
            data-testid={`presence-user-${section}-${p.username}`}
          >
            <Avatar className="h-5 w-5 cursor-pointer">
              <AvatarImage src={p.avatarUrl ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {initials(p.username)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">@{p.username}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
