# Network-level lookups shared by service modules.

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "zone" {
  description = "Cloudflare zone name (e.g. mp-lb.dev)"
  type        = string
}

data "cloudflare_zone" "main" {
  name = var.zone
}

output "zone_id" {
  value = data.cloudflare_zone.main.id
}
