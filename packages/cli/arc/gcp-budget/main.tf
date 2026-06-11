# Monthly billing budget with spend alerts at 50/90/100%. Ported from the
# legacy doctrine/infra budget.tf.

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "billing_account" {
  type = string
}

variable "gcp_project" {
  description = "GCP project the budget filters on"
  type        = string
}

variable "name" {
  type = string
}

variable "monthly_usd" {
  type    = number
  default = 10
}

resource "google_billing_budget" "main" {
  billing_account = var.billing_account
  display_name    = "${var.name}-monthly-budget"

  budget_filter {
    projects = ["projects/${var.gcp_project}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }
}
