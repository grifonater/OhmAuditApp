# Deployment

Create environment-specific Hyperdrive, R2, Queue, and secret bindings before deployment. Replace or extend the checked-in non-secret bindings per environment, run database migrations from a trusted CI job, then run `pnpm exec wrangler deploy --env <environment>`. Production promotion requires staging verification and migration review.
