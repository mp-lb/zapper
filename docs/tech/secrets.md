# Encrypted production secrets

Zapper uses ArcNet’s ordered Forum sources declared in `.arcnet/arcnet.yaml`.
The shared file is `mp-lb/mp-lb:/admin/standard-secrets.json.enc`; the project
file is `mp-lb/mp-lb:/projects/zapper/secrets.json.enc`. Their encrypted
snapshots live under `.arcnet/secrets/`, while each source’s decryption key is
stored as a GitHub repository secret.

The `deploy`, `publish`, and `desktop` consumer maps select the keys each CI job
may use. Never put credential values in YAML, `.env.production`, or workflow
logs. To change a value, edit its Forum file, run `arcnet secrets sync`, and
commit the refreshed encrypted snapshot. Run `arcnet env check --password`
locally, or use the generated validation workflow in GitHub, to confirm the
snapshots decrypt and the selected keys exist.

Use `arcnet secrets init --key ZAPPER_SECRETS_KEY --store mp-lb/mp-lb --path
/projects/zapper/secrets.json.enc --repository mp-lb/zapper` when creating a
new project source. It prompts locally and uploads the recipient key directly
to GitHub. The existing source needs only `arcnet secrets sync` after edits.
