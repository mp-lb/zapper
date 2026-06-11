# A Vercel-hosted static frontend with a custom domain + Cloudflare DNS.
# The actual upload (vercel deploy of the built output) is this module's
# post-apply hook (see module.yaml), using the project id output.

terraform {
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "name" {
  type = string
}

variable "domain" {
  type = string
}

# Cloudflare zone name (passed by arc alongside domain); the module does its
# own zone lookup and apex detection.
variable "dns_zone" {
  type = string
}

variable "www_redirect" {
  description = "Also register www.<domain> redirecting to <domain>; default: only for the zone apex"
  type        = bool
  default     = null
  nullable    = true
}

variable "framework" {
  description = "Vercel framework preset (e.g. nextjs); null = static upload"
  type        = string
  default     = null
}

variable "root_directory" {
  description = "Monorepo subdirectory Vercel builds from (framework projects)"
  type        = string
  default     = null
}

data "cloudflare_zone" "main" {
  name = var.dns_zone
}

locals {
  is_apex      = var.domain == var.dns_zone
  www_redirect = coalesce(var.www_redirect, local.is_apex)
}

resource "vercel_project" "main" {
  name             = var.name
  framework        = var.framework
  root_directory   = var.root_directory
  build_command    = null
  output_directory = null
}

resource "vercel_project_domain" "main" {
  project_id = vercel_project.main.id
  domain     = var.domain
}

resource "vercel_project_domain" "www" {
  count                = local.www_redirect ? 1 : 0
  project_id           = vercel_project.main.id
  domain               = "www.${var.domain}"
  redirect             = var.domain
  redirect_status_code = 308

  depends_on = [vercel_project_domain.main]
}

# Apex domains can't CNAME; Vercel publishes a stable A record for them.
resource "cloudflare_record" "main" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.domain
  content = local.is_apex ? "76.76.21.21" : "cname.vercel-dns.com"
  type    = local.is_apex ? "A" : "CNAME"
  proxied = false
  ttl     = 1
}

resource "cloudflare_record" "www" {
  count   = local.www_redirect ? 1 : 0
  zone_id = data.cloudflare_zone.main.id
  name    = "www.${var.domain}"
  content = "cname.vercel-dns.com"
  type    = "CNAME"
  proxied = false
  ttl     = 1
}

output "project_id" {
  value = vercel_project.main.id
}
