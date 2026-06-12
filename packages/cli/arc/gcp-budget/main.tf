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

# Must match the billing account's currency.
variable "currency" {
  type    = string
  default = "USD"
}

data "google_project" "main" {
  project_id = var.gcp_project
}

resource "google_billing_budget" "main" {
  billing_account = var.billing_account
  display_name    = "${var.name}-monthly-budget"

  budget_filter {
    # The Budget API requires the project *number*, not the ID.
    projects = ["projects/${data.google_project.main.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.currency
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
