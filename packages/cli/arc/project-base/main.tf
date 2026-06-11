# Per-project base resources: the Docker artifact registry images push to.

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_slug" {
  type = string
}

variable "region" {
  type = string
}

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = var.project_slug
  format        = "DOCKER"
  description   = "Docker repository for ${var.project_slug} (arcnet)"
}

output "repository_id" {
  value = google_artifact_registry_repository.main.repository_id
}
