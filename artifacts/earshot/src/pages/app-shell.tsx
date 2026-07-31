import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListConversations,
  getListConversationsQueryKey,
  type DirectMessage,
} from "@workspace/api-client-react";
import { Route, Switch, Redirect, Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/hooks/use-toast";
import { Headphones, Mic, Radio, MessageCircle, MessagesSquare, Users, LogOut, Loader2, Archive, ShieldCheck, ArrowLeft, ChevronRight, Link2, Check, User as UserIcon, Bookmark, Heart } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FaFacebookF, FaXTwitter, FaLinkedinIn, FaWhatsapp, FaRedditAlien, FaTelegram } from "react-icons/fa6";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { NotificationBell } from "@/components/notification-bell";
import ssfLogo from "@assets/IMG_2590_1784058753262.jpeg";
import { LogoutButton } from "@/App";
import { useIsMobile } from "@/hooks/use-mobile";
import type { User } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Overheard from "@/pages/sections/overheard";
import SelfRecorded from "@/pages/sections/self-recorded";
import GoLive from "@/pages/sections/go-live";
import Messages from "@/pages/sections/messages";
import Chat from "@/pages/sections/chat";
import People from "@/pages/sections/people";
import Archives from "@/pages/sections/archives";
import Admin from "@/pages/sections/admin";
import Settings from "@/pages/sections/settings";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";

const NAV_ITEMS = [
  { path: "/overheard", label: "OVERHEARD SOUNDS", icon: Headphones },
  { path: "/self-recorded", label: "SELF RECORDED SOUNDS", icon: Mic },
  { path: "/go-live", label: "GO LIVE FOR THE COMMUNITY", icon: Radio },
  { path: "/messages", label: "Messages", icon: MessageCircle },
  { path: "/chat", label: "Live Chat", icon: MessagesSquare },
  { path: "/people", label: "Users", icon: Users },
  { path: "/archives", label: "Archives", icon: Archive },
];

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function ProfileMenu({ me }: { me: User }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none ring-offset-background hover-elevate active-elevate-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Profile menu"
          data-testid="button-profile-menu"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={me.avatarUrl ?? undefined} />
            <AvatarFallback>{initials(me.username)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">
          {me.displayName || `@${me.username}`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${me.id}`} data-testid="menu-profile">
            <UserIcon className="mr-2 h-4 w-4" /> My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/u/${me.id}?tab=favorites`} data-testid="menu-favorites">
            <Bookmark className="mr-2 h-4 w-4" /> Favourites
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/u/${me.id}?tab=likes`} data-testid="menu-likes">
            <Heart className="mr-2 h-4 w-4" /> Liked
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/messages" data-testid="menu-messages">
            <MessageCircle className="mr-2 h-4 w-4" /> Messages
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/chat" data-testid="menu-live-chat">
            <MessagesSquare className="mr-2 h-4 w-4" /> Live Chat
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppShell() {
  const { user } = useUser();
  const { data: me, isLoading } = useGetMe();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const { data: conversations } = useListConversations();
  const { subscribe } = useRealtime();
  const qc = useQueryClient();
  const { toast } = useToast();
  const unreadMessages =
    conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

  useEffect(() => {
    const unsubscribe = subscribe("message:new", (msg) => {
      qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      const data = msg as unknown as { message: DirectMessage };
      const message = data?.message;
      if (message && message.recipientId === user?.id) {
        toast({
          title: "New message",
          description: message.content.length > 60 ? `${message.content.slice(0, 57)}...` : message.content,
        });
      }
    });
    return unsubscribe;
  }, [subscribe, qc, toast, user?.id]);

  const hasOnboarded = me?.onboarded === "true";
  const needsOnboarding = !isLoading && !!me && !hasOnboarded && !onboardingDismissed;

  const navItems =
    me?.role === "admin"
      ? [...NAV_ITEMS, { path: "/admin", label: "Admin", icon: ShieldCheck }]
      : NAV_ITEMS;

  const currentSection =
    navItems.find((item) => location.startsWith(item.path)) ??
    (location.startsWith("/settings") ? { label: "Profile" } : null);
  const onMobileHome = location === "/";

  if (isLoading || !me) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function handleOnboardingComplete() {
    setOnboardingDismissed(true);
  }

  return (
    <div className="flex min-h-screen">
      {needsOnboarding && <OnboardingDialog user={me} onComplete={handleOnboardingComplete} />}

      <aside className="hidden w-60 flex-col border-r border-border bg-[#0A0A0A] p-4 md:flex">
        <div className="mb-6 flex items-center justify-between gap-2 px-2">
          <NotificationBell />
          <Link href="/overheard" className="min-w-0 flex-1">
            <img
              src={ssfLogo}
              alt="SSF - Sex Sound Files logo - Home of the filthiest sounds"
              className="h-20 w-full rounded-lg object-contain"
            />
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const active = location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover-elevate active-elevate-2 ${
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }`}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.path === "/messages" && unreadMessages > 0 && (
                  <Badge
                    className="h-5 min-w-5 justify-center px-1"
                    data-testid="badge-nav-unread-messages"
                  >
                    {unreadMessages}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
          <Link
            href="/settings"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left hover-elevate active-elevate-2"
            data-testid="link-settings"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={me.avatarUrl ?? undefined} />
              <AvatarFallback>{initials(me.username)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" data-testid="text-current-username">
                {me.displayName || `@${me.username}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">Account settings</p>
            </div>
          </Link>
          <LogoutButton className="rounded-md p-2 text-muted-foreground hover-elevate active-elevate-2">
            <LogOut className="h-4 w-4" />
          </LogoutButton>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <SocialShare compact />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 bg-[#0A0A0A] px-3 py-2">
          <div className="md:hidden">
            <ProfileMenu me={me} />
          </div>
          <div className="md:hidden">
            <NotificationBell />
          </div>
          {!onMobileHome && (
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover-elevate active-elevate-2 md:hidden"
              data-testid="link-mobile-home"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <span className="truncate text-sm font-semibold tracking-tight md:hidden">
            {currentSection?.label ?? ""}
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">
          <Switch>
            <Route path="/overheard" component={Overheard} />
            <Route path="/self-recorded" component={SelfRecorded} />
            <Route path="/go-live" component={GoLive} />
            <Route path="/messages" component={Messages} />
            <Route path="/chat" component={Chat} />
            <Route path="/people" component={People} />
            <Route path="/archives" component={Archives} />
            <Route path="/settings" component={Settings} />
            <Route path="/u/:userId" component={Profile} />
            {me.role === "admin" && <Route path="/admin" component={Admin} />}
            <Route path="/">
              {isMobile ? (
                <MobileHome navItems={navItems} me={me} unreadMessages={unreadMessages} />
              ) : (
                <Redirect to="/overheard" />
              )}
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function MobileHome({
  navItems,
  me,
  unreadMessages,
}: {
  navItems: { path: string; label: string; icon: typeof Headphones }[];
  me: User;
  unreadMessages: number;
}) {
  return (
    <div className="space-y-6">
      <img
        src={ssfLogo}
        alt="SSF - Sex Sound Files banner - Home of the filthiest sounds and audio community"
        className="h-[180px] w-full rounded-xl object-cover"
      />

      <div className="grid grid-cols-2 gap-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showUnread = item.path === "/messages" && unreadMessages > 0;
          return (
            <Link
              key={item.path}
              href={item.path}
              className="media-card-red relative flex flex-col gap-3 rounded-xl p-4 hover-elevate active-elevate-2"
              data-testid={`link-home-${item.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {showUnread && (
                <Badge
                  className="absolute right-2 top-2 h-5 min-w-5 justify-center px-1"
                  data-testid="badge-home-unread-messages"
                >
                  {unreadMessages}
                </Badge>
              )}
              <Icon className="h-6 w-6 text-[#B8860B]" />
              <span className="text-sm font-medium leading-snug">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="space-y-2">
        <Link
          href="/settings"
          className="media-card-red flex items-center gap-3 rounded-xl border p-3 hover-elevate active-elevate-2"
          data-testid="link-home-profile"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={me.avatarUrl ?? undefined} />
            <AvatarFallback>{initials(me.username)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.displayName || `@${me.username}`}</p>
            <p className="truncate text-xs text-muted-foreground">Profile &amp; account settings</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <LogoutButton className="media-card-red flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium hover-elevate active-elevate-2">
          <span className="flex h-10 w-10 items-center justify-center">
            <LogOut className="h-5 w-5" />
          </span>
          Log out
        </LogoutButton>
      </div>

      <SocialShare />
    </div>
  );
}

function SocialShare({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";
  const shareText = "Check out SSF — share your sounds with the community.";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);

  const platforms = [
    {
      label: "Facebook",
      icon: FaFacebookF,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      label: "X",
      icon: FaXTwitter,
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      label: "LinkedIn",
      icon: FaLinkedinIn,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      label: "WhatsApp",
      icon: FaWhatsapp,
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    },
    {
      label: "Reddit",
      icon: FaRedditAlien,
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    },
    {
      label: "Telegram",
      icon: FaTelegram,
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
  ];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-medium text-[hsl(46,65%,55%)]">Share Overheard</p>
      <div className="grid grid-cols-4 gap-2">
        {platforms.map(({ label, icon: Icon, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${label}`}
            className={`media-card-red flex flex-col items-center rounded-xl border hover-elevate active-elevate-2 ${
              compact ? "gap-1 p-2" : "gap-1.5 p-3"
            }`}
            data-testid={`link-share-${label.toLowerCase()}`}
          >
            <Icon className={compact ? "h-4 w-4 text-[#B8860B]" : "h-5 w-5 text-[#B8860B]"} />
            {!compact && <span className="text-[11px] font-medium leading-none">{label}</span>}
          </a>
        ))}
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy link"
          className={`media-card-red flex flex-col items-center rounded-xl border hover-elevate active-elevate-2 ${
            compact ? "gap-1 p-2" : "gap-1.5 p-3"
          }`}
          data-testid="button-share-copy"
        >
          {copied ? (
            <Check className={compact ? "h-4 w-4 text-[#B8860B]" : "h-5 w-5 text-[#B8860B]"} />
          ) : (
            <Link2 className={compact ? "h-4 w-4 text-[#B8860B]" : "h-5 w-5 text-[#B8860B]"} />
          )}
          {!compact && (
            <span className="text-[11px] font-medium leading-none">
              {copied ? "Copied" : "Copy"}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
