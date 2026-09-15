# Deployment

Provision environment-specific bindings and secrets, run the complete verification suite, then use `pnpm exec wrangler deploy --env <environment>`. Production promotion follows successful staging verification. Checked-in configuration contains no credentials.

`AI_MODEL_CHAIN` is non-secret configuration containing a comma-separated ordered subset of the
three charger data-plate models documented in `README.md`. Invalid or duplicate identifiers cannot
expand the allowlist; an empty valid selection falls back to the production order.
