"use client";

import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface DownloadMacButtonProps {
  className?: string;
}

export const DownloadMacButton = ({ className }: DownloadMacButtonProps) => {
  const onClick = () => {
    posthog.capture("mac_download_cta_clicked");
  };

  return (
    <Button
      asChild
      variant="default"
      className={cn(
        "h-11 rounded-full bg-foreground px-5 font-mono-tight text-background shadow-[0_12px_30px_rgba(17,24,39,0.18)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-foreground/92",
        className,
      )}
      onClick={onClick}
    >
      <a href="/download/mac">
        <Download aria-hidden="true" />
        Download for Mac
      </a>
    </Button>
  );
};
