mock_provider "google" {}

variables {
  gcp_project_id = "test-project"
  repository     = "example/project"
  state_bucket   = "test-state"
}

run "project_scoped_ci_permissions" {
  command = plan

  assert {
    condition     = google_project_iam_member.deploy_wif_viewer.role == "roles/iam.workloadIdentityPoolViewer" && google_project_iam_member.deploy_wif_viewer.project == var.gcp_project_id
    error_message = "CI must read its WIF resources within its own project."
  }
  assert {
    condition     = google_project_iam_member.deploy_run_admin.role == "roles/run.admin" && google_project_iam_member.deploy_run_admin.project == var.gcp_project_id
    error_message = "CI must manage Cloud Run service IAM within its own project."
  }
  assert {
    condition     = length(google_billing_account_iam_member.budgets) == 0 && length(google_project_iam_member.quota_project_consumer) == 0
    error_message = "Shared-project and billing access must not be implicit."
  }
}
