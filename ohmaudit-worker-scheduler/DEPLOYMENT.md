# Deployment

Provision environment-specific bindings and secrets, run the complete verification suite, then use `pnpm exec wrangler deploy --env <environment>`. Production promotion follows successful staging verification. Checked-in configuration contains no credentials.
