variable "cloudflare_account_id" {
  description = "Cloudflare account receiving Ohm Audit resources."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be development, staging, or production"
  }
}
