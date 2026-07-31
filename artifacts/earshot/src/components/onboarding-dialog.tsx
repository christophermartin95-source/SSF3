import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarUpload } from "@/components/avatar-upload";
import { useToast } from "@/hooks/use-toast";
import {
  checkUsernameAvailability,
  useUpdateMe,
  type User,
} from "@workspace/api-client-react";

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function OnboardingDialog({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">(
    "idle",
  );
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMe = useUpdateMe();

  useEffect(() => {
    if (username === user.username) {
      setAvailability("idle");
      return;
    }
    if (username.length < 3) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const handle = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability({ username });
        setAvailability(result.available ? "available" : "taken");
      } catch {
        setAvailability("idle");
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [username, user.username]);

  const canSubmit =
    username.length >= 3 && (username === user.username || availability === "available");

  async function handleSubmit() {
    try {
      await updateMe.mutateAsync({
        data: {
          username,
          displayName: displayName || undefined,
          bio: bio || undefined,
          avatarUrl: avatarUrl ?? undefined,
          onboarded: "true",
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      onComplete();
    } catch (err) {
      toast({
        title: "Couldn't save profile",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Welcome to SSF</DialogTitle>
          <DialogDescription>
            Choose a public username — this is what everyone sees. Your email stays private.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Profile photo (optional)</Label>
            <AvatarUpload
              value={avatarUrl}
              fallback={initials(username || user.username)}
              onChange={setAvatarUrl}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-username">Username</Label>
            <Input
              id="onboarding-username"
              value={username}
              onChange={(e) => setUsername(sanitize(e.target.value))}
              placeholder="e.g. nightowl"
              data-testid="input-onboarding-username"
            />
            {availability === "checking" && (
              <p className="text-xs text-muted-foreground">Checking availability…</p>
            )}
            {availability === "available" && (
              <p className="text-xs text-green-600">Username is available</p>
            )}
            {availability === "taken" && (
              <p className="text-xs text-destructive">That username is taken</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-display-name">Display name (optional)</Label>
            <Input
              id="onboarding-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we address you?"
              data-testid="input-onboarding-display-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onboarding-bio">Bio (optional)</Label>
            <Textarea
              id="onboarding-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a bit about what you share"
              rows={3}
              data-testid="input-onboarding-bio"
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || updateMe.isPending}
            onClick={handleSubmit}
            data-testid="button-onboarding-continue"
          >
            {updateMe.isPending ? "Saving…" : "Start using SSF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
