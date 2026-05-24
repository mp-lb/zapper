# Encrypted Secrets File

Use a committed encrypted secrets file for project-specific deployment secrets.
Keep the decryption key in the platform secret store.

## Convention

- Commit encrypted secrets as `proj/secrets.txt.enc`.
- Store the decryption key as `SECRETS_KEY` in GitHub Secrets.
- Decrypt only inside CI or a trusted local shell.
- Write decrypted output to a temporary or gitignored file.
- Never commit decrypted secrets.

## Format

The decrypted file may be a JSON object:

```json
{
  "API_TOKEN": "...",
  "SERVICE_PASSWORD": "..."
}
```

It may also use one variable per line:

```sh
API_TOKEN=...
SERVICE_PASSWORD=...
MULTILINE_VALUE=...
```

`KEY: value` is also acceptable when the deployment parser supports it. Use
uppercase underscore keys. Quote values only when the consumer requires it.

## CI Usage

Decrypt early in the deploy job:

```sh
npx -y @mp-lb/doctrine-secrets decrypt proj/secrets.txt.enc \
  --secret "$SECRETS_KEY" > secrets.txt
```

Then load it into the job environment:

```sh
set -a
. ./secrets.txt
set +a
```

Mask secret values before logging or exporting them. Delete temporary plaintext
files with a shell trap when possible.

## Rules

- `.env.production` is for non-secret production config.
- The encrypted secrets file is for secret production values.
- GitHub Secrets should contain only the decryption key and shared platform
  secrets that are intentionally managed outside the repo.
- Rotation means updating the plaintext source, re-encrypting the file, and
  rotating `SECRETS_KEY` when the key itself may be exposed.
