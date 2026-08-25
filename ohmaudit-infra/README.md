# Ohm Audit Infrastructure

Environment naming, typed configuration validation, and Terraform foundations for Cloudflare resources. Supabase project/database provisioning may remain provider-managed, but schema changes are always owned by Prisma migrations in `ohmaudit-api`.

## Development

```bash
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
terraform -chdir=terraform init
terraform -chdir=terraform plan -var-file=staging.tfvars
```

Use remote encrypted state with locking before provisioning shared environments. Never commit `.tfvars`, state files, API tokens, database credentials, or provider secrets.
