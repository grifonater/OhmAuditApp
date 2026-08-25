# Deployment

Publishing is performed from a reviewed tag with registry provenance enabled by CI. Increment the package version according to semantic versioning, verify schema compatibility, run `pnpm build`, and publish `dist` plus `openapi` with `pnpm deploy`.
