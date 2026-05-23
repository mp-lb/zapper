<wizard-report>
# PostHog setup report

PostHog is integrated into the Zapper landing page with the same client-side
pattern used by Doctrine's landing page.

- **`app/PostHogAnalytics.tsx`** initializes `posthog-js` in a client component
  mounted from the root layout.
- **`app/layout.tsx`** renders `<PostHogAnalytics />` before page content.
- **`NEXT_PUBLIC_POSTHOG_KEY`** provides the PostHog project token.
- **`NEXT_PUBLIC_POSTHOG_HOST`** provides the API host and defaults to
  `https://us.i.posthog.com` when unset.
- **`lib/posthog-server.ts`** uses the same public key and host for the
  server-side download redirect event.
- **`components/landing/InstallSnippet.tsx`** captures
  `install_command_copied` when users copy the install command.
- **`components/landing/DownloadMacButton.tsx`** captures
  `mac_download_cta_clicked` on click.
- **`components/landing/DocsCTAButton.tsx`** captures `docs_cta_clicked` with
  `label` and `href` properties.
- **`app/download/mac/route.ts`** captures `mac_download_initiated` server-side
  whenever the macOS download redirect endpoint is hit.

## Events

| Event | Description | File |
|---|---|---|
| `install_command_copied` | User copied the install command snippet from the hero or CTA section | `components/landing/InstallSnippet.tsx` |
| `mac_download_cta_clicked` | User clicked the Download for Mac button on the landing page | `components/landing/DownloadMacButton.tsx` |
| `docs_cta_clicked` | User clicked a Read the docs or Read the agent docs CTA button | `components/landing/DocsCTAButton.tsx` |
| `mac_download_initiated` | Server-side: user was redirected to the macOS download URL via the /download/mac route | `app/download/mac/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1608702)
- [Install command copies over time](/insights/LrTX8m3z)
- [Mac downloads over time](/insights/cdtTTA19)
- [Docs CTA clicks over time](/insights/58GIKkRt)
- [Install-to-Download conversion funnel](/insights/XbWDUdGh)
- [All key events (30d totals)](/insights/TjUqqe9L)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
