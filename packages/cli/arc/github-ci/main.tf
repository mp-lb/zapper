# Keyless CI deploys: GitHub Actions OIDC → Workload Identity Federation.
# Self-contained per project: pool + provider + deploy service account +
# bindings live in the project's own GCP project. Deterministic names, so
# workflows can be written without output plumbing:
#   provider: projects/<number>/locations/global/workloadIdentityPools/github/providers/github-actions
#   SA email: arc-deploy@<gcp project>.iam.gserviceaccount.com

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "gcp_project_id" {
  type = string
}

# Repository allowed to deploy, e.g. "mp-lb/forum".
variable "repository" {
  type = string
}

# State bucket the deploy SA must read/write (lives in the network project).
variable "state_bucket" {
  type = string
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.gcp_project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  project                            = var.gcp_project_id
  workload_identity_pool_id         = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == \"${var.repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  project      = var.gcp_project_id
  account_id   = "arc-deploy"
  display_name = "Arc CI deploys"
}

# Lab-grade: editor on the project's own boundary. The GCP project *is* the
# blast radius; tighten to granular roles if that ever stops being true.
resource "google_project_iam_member" "deploy_editor" {
  project = var.gcp_project_id
  role    = "roles/editor"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# Terraform state lives in the network project's bucket.
resource "google_storage_bucket_iam_member" "deploy_state" {
  bucket = var.state_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.repository}"
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github_actions.name
}

output "service_account_email" {
  value = google_service_account.deploy.email
}
