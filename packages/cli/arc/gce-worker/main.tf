# An always-on container worker on a small GCE VM (container-optimized OS).
# Faithful port of doctrine/infra worker.tf, incl. the daily Docker prune.

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type = string
}

variable "env" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "machine_type" {
  type    = string
  default = "e2-micro"
}

locals {
  env = merge(var.env, {
    APP_ENV  = "production"
    NODE_ENV = "production"
  })
}

resource "google_compute_instance" "main" {
  name         = var.name
  machine_type = var.machine_type
  zone         = "${var.region}-a"
  tags         = [var.name]

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
      size  = 30
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"

    access_config {}
  }

  metadata = {
    google-logging-enabled = "true"
    startup-script         = <<-EOT
      #!/bin/bash
      set -euo pipefail

      cat >/etc/systemd/system/docker-cleanup.service <<'EOF'
      [Unit]
      Description=Prune stale Docker state for the worker VM
      After=docker.service
      Wants=docker.service

      [Service]
      Type=oneshot
      ExecStart=/usr/bin/docker container prune --force --filter until=24h
      ExecStart=/usr/bin/docker image prune --all --force --filter until=24h
      ExecStart=/usr/bin/docker builder prune --all --force --filter until=24h
      EOF

      cat >/etc/systemd/system/docker-cleanup.timer <<'EOF'
      [Unit]
      Description=Run Docker cleanup daily

      [Timer]
      OnBootSec=15min
      OnUnitActiveSec=1d
      Persistent=true

      [Install]
      WantedBy=timers.target
      EOF

      systemctl daemon-reload
      systemctl enable --now docker-cleanup.timer
    EOT
    gce-container-declaration = yamlencode({
      spec = {
        containers = [
          {
            image = var.image
            env = [
              for name, value in local.env : {
                name  = name
                value = value
              }
            ]
          }
        ]
        restartPolicy = "Always"
      }
    })
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  labels = {
    container-vm = "cos-stable"
  }
}

output "instance_name" {
  value = google_compute_instance.main.name
}

output "zone" {
  value = google_compute_instance.main.zone
}
