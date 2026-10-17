# Environment variables in this repository

Local Zap services use committed `.env.local` defaults and ignored `.env` secrets.
The project’s production delivery settings live in `.arcnet/arcnet.yaml`:

- `variables` holds non-secret values. ArcNet passes the relevant values to
  Vercel builds. The Zapper CLI build also reads the PostHog values from here.
- `secrets.sources` lists the shared and Zapper-specific encrypted Forum files.
  Their reviewed ciphertext snapshots are committed under `.arcnet/secrets/`.
- `secrets.consumers` selects only the values needed by `deploy`, `publish`, or
  `desktop`. Editing a source requires `arcnet secrets sync` and a commit of the
  refreshed snapshot.

The macOS release uses public `APPLE_ID` and `APPLE_TEAM_ID` from `variables`
and selects `CSC_LINK`, `CSC_KEY_PASSWORD`, and
`APPLE_APP_SPECIFIC_PASSWORD` from the `desktop` consumer. GitHub stores only
per-source decryption keys. The production release does not read a root
`.env.production` file.

This describes Zapper’s own delivery configuration. The Zap Arc engine still
supports a `public-file` for other projects that explicitly configure one.
