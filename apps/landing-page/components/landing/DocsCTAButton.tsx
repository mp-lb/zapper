"use client";

import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocsCTAButtonProps {
  href: string;
  label: string;
  className?: string;
}

export const DocsCTAButton = ({
  href,
  label,
  className,
}: DocsCTAButtonProps) => {
  const onClick = () => {
    posthog.capture("docs_cta_clicked", { label, href });
  };

  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        "h-10 rounded-full border border-foreground/12 bg-card/80 px-5 font-mono-tight shadow-sm backdrop-blur transition-transform duration-200 hover:-translate-y-0.5 hover:bg-card",
        className,
      )}
      onClick={onClick}
    >
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    </Button>
  );
};
