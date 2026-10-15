# Custom domains with ArcNet

Project deployment selections live in `.arcnet/arcnet.yaml`. A Cloud Run service can set `domain` and `dns-zone` there; the ArcNet environment supplies provider credentials and Terraform defaults. See the [ArcNet project setup](https://github.com/mp-lb/stackforge/blob/main/arcnet/SETUP.md) and [domain lifecycle design](https://github.com/mp-lb/stackforge/blob/main/arcnet/DOMAINS.md).

Vercel sites currently deploy to their Vercel production aliases. ArcNet does not yet create custom Vercel domain bindings or DNS records for them. Add or remove those only after checking the exact project, DNS zone, and any application URLs that reference the domain. The eventual source of truth is the project's `arcnet.yaml`; avoid adding another Terraform directory to a project for this purpose.
