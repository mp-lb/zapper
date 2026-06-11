# A public HTTP service on Cloud Run with a custom domain (Cloud Run domain
# mapping + Cloudflare DNS record). Ported from the proven doctrine/infra
# backend.tf.

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
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

variable "gcp_project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type = string
}

variable "port" {
  type    = number
  default = 8080
}

variable "env" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "domain" {
  type = string
}

# Cloudflare zone name (passed by arc alongside domain); the module does its
# own zone lookup.
variable "dns_zone" {
  type = string
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 2
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "cpu" {
  type    = string
  default = "1"
}

# Requests served concurrently per instance — the autoscaling knob (Cloud Run
# adds instances as concurrency fills, up to max_instances).
variable "concurrency" {
  type    = number
  default = 80
}

variable "health_path" {
  type    = string
  default = "/health"
}

data "cloudflare_zone" "main" {
  name = var.dns_zone
}

locals {
  env = merge(var.env, {
    # Cap V8's old-space heap below the container limit; Node doesn't read the
    # cgroup limit and will otherwise grow its heap past the container ceiling.
    NODE_OPTIONS = "--max-old-space-size=384"
  })
}

resource "google_cloud_run_v2_service" "main" {
  name     = var.name
  location = var.region

  template {
    containers {
      image = var.image

      ports {
        container_port = var.port
      }

      dynamic "env" {
        for_each = local.env
        content {
          name  = env.key
          value = env.value
        }
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }

        # CPU always allocated so background exporters (OTel) can flush.
        cpu_idle = false
      }

      startup_probe {
        failure_threshold     = 12
        initial_delay_seconds = 0
        period_seconds        = 5
        timeout_seconds       = 5

        http_get {
          path = var.health_path
          port = var.port
        }
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    max_instance_request_concurrency = var.concurrency

    timeout = "3600s"
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = google_cloud_run_v2_service.main.project
  location = google_cloud_run_v2_service.main.location
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_domain_mapping" "main" {
  name     = var.domain
  location = var.region

  metadata {
    namespace = var.gcp_project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.main.name
  }
}

resource "cloudflare_record" "main" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.domain
  content = google_cloud_run_domain_mapping.main.status[0].resource_records[0].rrdata
  type    = google_cloud_run_domain_mapping.main.status[0].resource_records[0].type
  proxied = false
  ttl     = 1
}

output "url" {
  value = google_cloud_run_v2_service.main.uri
}

output "domain_url" {
  value = "https://${var.domain}"
}
