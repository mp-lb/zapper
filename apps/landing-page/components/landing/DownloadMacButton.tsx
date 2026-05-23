"use client";

import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const DownloadMacButton = () => {
  const onClick = () => {
    posthog.capture("mac_download_cta_clicked");
  };

  return (
    <Button
      asChild
      variant="default"
      className="h-10 font-mono-tight"
      onClick={onClick}
    >
      <a href="/download/mac">
        <Download aria-hidden="true" />
        Download for Mac
      </a>
    </Button>
  );
};
