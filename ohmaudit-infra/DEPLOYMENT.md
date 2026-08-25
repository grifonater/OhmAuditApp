# Deployment

Infrastructure changes require a reviewed plan per environment. Configure remote state and least-privilege Cloudflare credentials, run `terraform plan`, archive the plan in CI, obtain approval for production, then apply that exact plan. Application Worker deployments remain owned by their repositories.
