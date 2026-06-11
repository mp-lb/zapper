# One Upstash Redis database for the project. Faithful port of
# doctrine/infra redis.tf; shared-redis is a later arcnet phase.

terraform {
  required_providers {
    upstash = {
      source  = "upstash/upstash"
      version = "~> 1.0"
    }
  }
}

variable "name" {
  type = string
}

resource "upstash_redis_database" "main" {
  database_name  = var.name
  region         = "global"
  primary_region = "us-east-1"
  tls            = true
}

output "redis_url" {
  value     = "rediss://default:${upstash_redis_database.main.password}@${upstash_redis_database.main.endpoint}:${upstash_redis_database.main.port}"
  sensitive = true
}
