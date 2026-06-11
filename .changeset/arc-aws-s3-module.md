---
"@mp-lb/zapper": minor
---

New bundled arc module `aws-s3`: a private, versioned S3 bucket plus an IAM
user scoped to that bucket only, injecting `AWS_S3_BUCKET`, `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` into sibling container
services. AWS auth comes from the network's provider config
(`{{cred.AWS_*}}`) or ambient AWS configuration.

Arc env precedence fix: module env injections now fill gaps only — a
service's own `env:` entry (whitelist or literal) wins on conflict, so a
project can adopt a binding module without its injected values overriding
explicitly declared env.
