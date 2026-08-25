provider "cloudflare" {}

locals {
  prefix = "ohmaudit-${var.environment}"
}

# Resources are introduced with their owning milestone. State must use a remote,
# access-controlled backend before shared environments are provisioned.
