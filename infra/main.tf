terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.36"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  project_services = [
    "compute.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
  ]

  iam_roles = [
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/secretmanager.secretAccessor",
  ]

  need_secret_access = (
    (var.use_secret_manager && var.secret_id != "") ||
    (var.repo_token_secret_id != "")
  )
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.project_services)
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

resource "google_service_account" "bot" {
  account_id   = var.service_account_id
  display_name = "Tatekae Seisan Bot VM"
  depends_on   = [google_project_service.enabled]
}

resource "google_project_iam_member" "bot_roles" {
  for_each = { for role in local.iam_roles :
    role => role if !(role == "roles/secretmanager.secretAccessor" && !local.need_secret_access)
  }

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.bot.email}"
}

resource "google_compute_instance" "bot" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone

  allow_stopping_for_update = true
  tags                      = var.instance_tags

  boot_disk {
    initialize_params {
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
      image = var.boot_disk_image
    }
  }

  network_interface {
    network = var.network

    access_config {
      // Reserving a static IP is optional; leaving NAT empty uses an ephemeral IP within the Always Free quota.
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh.tmpl", {
    app_user           = var.app_user
    working_dir        = var.working_dir
    repo_url           = var.repo_url
    service_name       = var.service_name
    node_version       = var.node_version
    use_secret_manager = var.use_secret_manager
    project_id         = var.project_id
    secret_id          = var.secret_id
    github_pat_secret_id = var.repo_token_secret_id
  })

  service_account {
    email  = google_service_account.bot.email
    # Include cloud-platform (for Secret Manager etc.) and Workspace API scopes explicitly
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_project_iam_member.bot_roles,
  ]
}

output "instance_self_link" {
  value = google_compute_instance.bot.self_link
}

output "service_account_email" {
  value = google_service_account.bot.email
}
