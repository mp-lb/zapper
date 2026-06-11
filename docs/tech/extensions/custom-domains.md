# Custom Domains

The default deployment uses:

- Frontend: `https://<project>.maplab.dev`
- Backend: `https://api.<project>.maplab.dev`

That works because `maplab.dev` is already verified for Cloud Run, is in the shared Cloudflare account, and the shared GitHub secrets include the Cloudflare zone credentials.

## What Changes

For a custom domain, there are four places to update:

1. Terraform domain inputs in `infra/terraform.tfvars`.
2. Production URLs in `.env.production`.
3. Runbook URLs in the project's deployment runbook.
4. DNS/domain ownership setup in Vercel, Cloud Run/Search Console, and the DNS provider.

The app itself only cares about `VITE_API_BASE_URL` and `FRONTEND_URL`. The hosting providers care about domain ownership, certificate provisioning, and DNS records.

Keep `project_name` stable unless you intentionally want to rename/recreate
provider resources such as the Vercel project and Cloud Run services. Public
rebrands usually only need `domain`, `frontend_domain`, and `backend_domain`.

## Terraform Inputs

Keep `project_name` as the internal resource slug. Set explicit fully qualified domains when the public URL is not `<project>.<domain>`:

```hcl
project_name    = "myapp"
domain          = "example.com"
frontend_domain = "www.example.com"
backend_domain  = "api.example.com"
```

For a frontend subdomain, the default Vercel DNS target is usually:

```hcl
frontend_dns_record_type    = "CNAME"
frontend_dns_record_content = "cname.vercel-dns.com"
```

For an apex frontend such as `example.com`, Vercel usually requires an A record. Use the exact value shown by Vercel, commonly:

```hcl
frontend_domain             = "example.com"
frontend_dns_record_type    = "A"
frontend_dns_record_content = "76.76.21.21"
```

If DNS is not managed in the Cloudflare account used by this repo, disable DNS creation:

```hcl
manage_cloudflare_dns = false
```

Terraform will still create the Vercel project domain and Cloud Run domain mapping, but a human must add the DNS records at the authoritative DNS provider.
Use `terraform output frontend_dns_record` and `terraform output backend_dns_record` after apply to get the records to send to the DNS owner.

If DNS is managed by Cloudflare, make sure `CLOUDFLARE_ZONE_ID` points to the
zone for the custom base domain, not the old/default domain.

## Domains In Our Cloudflare Account

Use this path when Map Lab controls the domain or can add it to the shared Cloudflare account.

1. Add the domain to Cloudflare if it is not already there.
2. Set the repo or org secret `CLOUDFLARE_ZONE_ID` to that domain's Cloudflare Zone ID.
3. Ensure `CLOUDFLARE_API_TOKEN` has DNS edit access for that zone.
4. Verify the base domain in Google Search Console for Cloud Run.
5. Add the Terraform service account as a delegated owner in Search Console, so Terraform can create Cloud Run domain mappings. For Map Lab projects this is `terraform@maplab-projects.iam.gserviceaccount.com`.
6. Set `frontend_domain` and `backend_domain` in `infra/terraform.tfvars`.
7. Update `.env.production`:

```dotenv
VITE_API_BASE_URL=https://api.example.com
FRONTEND_URL=https://www.example.com
```

8. Run `terraform apply` or push to `main`.
9. In Vercel, inspect the domain and confirm DNS and certificate status.
10. Check `https://<frontend-domain>` and `https://<backend-domain>/health`.

## Client-Owned Or External DNS

Use this path when the domain stays in a client's registrar/DNS provider.

1. Set `manage_cloudflare_dns = false`.
2. Verify the base domain in Google Search Console. If the client controls DNS, ask them to add the Search Console TXT verification record.
3. Add the Terraform service account as a delegated owner in Search Console. For Map Lab projects this is `terraform@maplab-projects.iam.gserviceaccount.com`.
4. Apply Terraform once to create:
  - The Vercel project domain.
  - The Cloud Run domain mapping.
5. Get the required DNS records:
  - Frontend: `terraform output frontend_dns_record`, then confirm with Vercel domain inspection.
  - Backend: `terraform output backend_dns_record`.
6. Send the client the exact records to add.
7. Re-check Vercel and Cloud Run after DNS propagates.

## Manual DNS Checklist

Use this path when Terraform should configure the hosting providers but should
not write DNS records. This is the safest path for a new domain when the CI
Cloudflare token only has access to the normal shared zone.

Before deploying:

1. Set the Terraform inputs:

```hcl
domain                = "example.com"
frontend_domain       = "app.example.com"
backend_domain        = "api.example.com"
manage_cloudflare_dns = false
```

2. Update production app URLs:

```dotenv
VITE_API_BASE_URL=https://api.example.com
FRONTEND_URL=https://app.example.com
```

3. Verify the base domain in Google Search Console.
  - Add a domain property for `example.com`.
  - Add the TXT verification record at the authoritative DNS provider.
  - After verification, add the Terraform service account as an owner. For
  Map Lab projects this is `terraform@maplab-projects.iam.gserviceaccount.com`.
4. Confirm the frontend domain will point at Vercel:

```text
Type: CNAME
Name: app
Target: cname.vercel-dns.com
Proxy: DNS only
```

5. Deploy once. This lets Terraform create the Vercel domain and the Cloud Run
 domain mapping. The deploy workflow prints `terraform output` at the end.
6. Add or confirm the frontend DNS record in the DNS provider. If Vercel shows
 a different target in its domain inspection UI, use Vercel's value instead
 of the default above.
7. Add the backend DNS record from Terraform output:

```bash
terraform output backend_dns_record
```

For a Cloud Run subdomain this is usually a DNS-only `CNAME` record, but do not
guess the value. Use the exact `name`, `type`, and `content` from Terraform or
the Google Cloud Run custom domain page.

8. Wait for certificate provisioning.
  - Vercel should show the frontend domain as valid.
  - Cloud Run should show the backend domain certificate as active.
  - Certificate provisioning often takes minutes but can take longer.
9. Verify:

```bash
curl https://api.example.com/health
```

Then load `https://app.example.com` in a browser and confirm the frontend calls
the new API domain.

## Notes

- Cloud Run custom domain mappings are a preview feature and Google does not recommend them for production services with stricter needs. For higher-control production backends, use a global external Application Load Balancer in front of Cloud Run instead.
- Google-managed certificates for Cloud Run are issued automatically, usually in minutes but sometimes up to 24 hours.
- Keep Cloudflare records DNS-only unless there is a tested reason to proxy them. The current Terraform sets `proxied = false`.
- Vercel may show a project-specific CNAME target. Prefer the value from Vercel's domain inspection over a hardcoded target when they differ.
- If both `example.com` and `www.example.com` are used, configure one as canonical and redirect the other in Vercel to avoid duplicate frontend domains.
