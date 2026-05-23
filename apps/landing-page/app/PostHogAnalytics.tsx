"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

const postHogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY;

const postHogApiHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const PostHogAnalytics = () => {
  useEffect(() => {
    if (!postHogProjectToken) {
      return;
    }

    posthog.init(postHogProjectToken, {
      api_host: postHogApiHost,
      defaults: "2026-01-30",
    });
  }, []);

  return null;
};
