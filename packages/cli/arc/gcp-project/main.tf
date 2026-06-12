# Project factory: the per-project GCP project, created by Terraform on first
# deploy (billing linked, APIs enabled). The project boundary is the
# per-project inventory, drift-diff, and guaranteed-teardown unit — destroying
# this module deletes the GCP project (30-day recovery window).
#
# A deliberately bare module: project-id and billing-account arrive via the
# network config's module-defaults (e.g. project-id: "{gcp-project}").

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  type = string
}

variable "billing_account" {
  type    = string
  default = ""
}

variable "apis" {
  type = list(string)
  default = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "billingbudgets.googleapis.com",
    # IAM is project infrastructure (service accounts, WIF) — enabled for
    # every project so no module ever hits a 403 on it.
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
  ]
}

resource "google_project" "main" {
  project_id      = var.project_id
  name            = var.project_id
  billing_account = var.billing_account != "" ? var.billing_account : null

  labels = {
    arc-managed = "true"
  }
}

resource "google_project_service" "main" {
  for_each = toset(var.apis)
  project  = google_project.main.project_id
  service  = each.value

  # APIs stay enabled if a service stops using them; project deletion is the
  # teardown path.
  disable_on_destroy = false
}

output "project_id" {
  value = google_project.main.project_id
}
