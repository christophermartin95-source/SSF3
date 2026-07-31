import { useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ImagePlus } from "lucide-react";

/**
 * Lets a user pick an image from their device and upload it as their avatar.
 * On success it calls `onChange` with a servable URL (`/api/storage/...`) that
 * can be stored directly as the user's `avatarUrl`.
 */
export function AvatarUpload({
  value,
  fallback,
  onChange,
}: {
  value?: string | null;
  fallback: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({ basePath: "/api/storage" });
  const { toast } = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Unsupported file",
        description: "Please choose an image for your avatar.",
        variant: "destructive",
      });
      return;
    }

    try {
      const uploaded = await uploadFile(file);
      if (!uploaded) throw new Error("Upload failed");
      onChange(`/api/storage${uploaded.objectPath}`);
    } catch (err) {
      toast({
        title: "Couldn't upload image",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        <AvatarImage src={value ?? undefined} />
        <AvatarFallback className="text-lg">{fallback}</AvatarFallback>
      </Avatar>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        data-testid="input-avatar-file"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        data-testid="button-upload-avatar"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        {value ? "Change" : "Upload"}
      </Button>
    </div>
  );
}
