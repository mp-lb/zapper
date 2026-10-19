# A binding onto the existing shared MongoDB Atlas cluster: one scoped
# database user (readWrite on a single database) + the connection string.
# The cluster itself is network-level infrastructure and is not managed here.

terraform {
  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

variable "atlas_project_id" {
  type = string
}

variable "cluster_host" {
  description = "Cluster SRV host, e.g. cluster0.abcde.mongodb.net"
  type        = string
}

variable "username" {
  type = string
}

variable "database" {
  type = string
}

# Optional role-specific databases. Omitted roles use the primary database.
variable "content_database" {
  type    = string
  default = ""
}

variable "admin_database" {
  type    = string
  default = ""
}

variable "user_database" {
  type    = string
  default = ""
}

locals {
  content_database = var.content_database != "" ? var.content_database : var.database
  admin_database   = var.admin_database != "" ? var.admin_database : var.database
  user_database    = var.user_database != "" ? var.user_database : var.database
  role_databases   = distinct([local.content_database, local.admin_database, local.user_database])
}

# Additional databases this user may readWrite (e.g. temporarily during a
# data migration). Remove entries when done.
variable "extra_databases" {
  type    = list(string)
  default = []
}

# URL-safe so the connection string needs no encoding.
resource "random_password" "main" {
  length  = 32
  special = false
}

resource "mongodbatlas_database_user" "main" {
  project_id         = var.atlas_project_id
  auth_database_name = "admin"
  username           = var.username
  password           = random_password.main.result

  roles {
    role_name     = "readWrite"
    database_name = var.database
  }

  dynamic "roles" {
    for_each = toset(distinct(concat(var.extra_databases, [for database in local.role_databases : database if database != var.database])))
    content {
      role_name     = "readWrite"
      database_name = roles.value
    }
  }
}

output "url" {
  value     = "mongodb+srv://${var.username}:${random_password.main.result}@${var.cluster_host}/${var.database}?retryWrites=true&w=majority"
  sensitive = true
}

output "content_url" {
  value     = "mongodb+srv://${var.username}:${random_password.main.result}@${var.cluster_host}/${local.content_database}?retryWrites=true&w=majority"
  sensitive = true
}

output "admin_url" {
  value     = "mongodb+srv://${var.username}:${random_password.main.result}@${var.cluster_host}/${local.admin_database}?retryWrites=true&w=majority"
  sensitive = true
}

output "user_url" {
  value     = "mongodb+srv://${var.username}:${random_password.main.result}@${var.cluster_host}/${local.user_database}?retryWrites=true&w=majority"
  sensitive = true
}
