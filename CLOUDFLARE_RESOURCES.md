# Cloudflare production resources

Ohm Audit production is pinned to the Cloudflare account named `ohmaudit` with account ID
`488131b4b757ad9a4541451b792e83e5`.

## Required core resources

| Purpose | Cloudflare resource | Production name |
| --- | --- | --- |
| Angular application | Worker with static assets | `ohmaudit-web` |
| REST API | Worker | `ohmaudit-api-production` |
| PDF renderer | Worker service binding | `ohmaudit-worker-pdf-production` |
| Uploaded media | R2 bucket | `ohmaudit-media-production` |
| Supabase connection pooling | Hyperdrive | `ohmaudit-db-production` (`1b9c83b57a96418f9dc6e40126a34372`) |

The production web origins allowed by the API are `https://ohmaudit-web.ohmaudit.workers.dev` and
`https://ohmaudit.com`. The production API URL is
`https://ohmaudit-api-production.ohmaudit.workers.dev/api/v1`.

## Production status

The Angular, API, and PDF Workers are deployed in `ohmaudit`. The production R2 bucket and
Hyperdrive configuration are provisioned there and bound to the API. The live web application is
`https://ohmaudit-web.ohmaudit.workers.dev`, and the API health endpoint is
`https://ohmaudit-api-production.ohmaudit.workers.dev/api/v1/health`.

The personal account contains old R2 buckets, a Hyperdrive configuration, and legacy queues, but no
expected current production Worker.

The current application does not bind to the legacy `pdf-queue`, `pdf-queue-dlq`, `evcp-reports`,
`ohmaudit-pdf`, or `ohmaudit-user-upload` resources. Do not recreate them unless a future feature
explicitly introduces a binding for them.

Secrets and database connection strings must remain in ignored local environment files or
Cloudflare secrets, never in this inventory.
