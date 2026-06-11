# PostHog managed reverse proxy: a proxied CNAME to the target PostHog mints
# per-domain in its settings. Ported from the legacy doctrine/infra dns.tf.

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# The full record name, e.g. phrp.forum.example.com.
variable "domain" {
  type = string
}

variable "dns_zone" {
  type = string
}

variable "target" {
  description = "CNAME target from PostHog's managed proxy settings"
  type        = string
}

data "cloudflare_zone" "main" {
  name = var.dns_zone
}

resource "cloudflare_record" "main" {
  allow_overwrite = true
  zone_id = data.cloudflare_zone.main.id
  name    = var.domain
  content = var.target
  type    = "CNAME"
  proxied = true
  ttl     = 1
}
