"use client";

import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

interface DocsCTAButtonProps {
  href: string;
  label: string;
}

export const DocsCTAButton = ({ href, label }: DocsCTAButtonProps) => {
  const onClick = () => {
    posthog.capture("docs_cta_clicked", { label, href });
  };

  return (
    <Button
      asChild
      variant="outline"
      className="h-10 font-mono-tight"
      onClick={onClick}
    >
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    </Button>
  );
};
