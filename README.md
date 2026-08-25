# Ohm Audit

Ohm Audit is a multi-tenant asset management, inspection, compliance, and facilities-maintenance platform for electrical contractors. This monorepo contains the Angular PWA, API, document renderer, supporting Workers, shared contracts, infrastructure definitions, and product documentation.

## Projects

| Project                         | Responsibility                                                    |
| ------------------------------- | ----------------------------------------------------------------- |
| `ohmaudit-web`                  | Angular 22 installable PWA for administrators and field engineers |
| `ohmaudit-api`                  | Hono REST API and modular-monolith domain boundary                |
| `ohmaudit-contracts`            | Versioned schemas, OpenAPI source, events, and shared identifiers |
| `ohmaudit-worker-scheduler`     | Hourly schedule occurrence processing                             |
| `ohmaudit-worker-notifications` | In-app, email, and SMS delivery orchestration                     |
| `ohmaudit-worker-pdf`           | HTML/CSS document rendering through Cloudflare Browser Rendering  |
| `ohmaudit-worker-ai`            | Provider-neutral AI jobs and human-review candidates              |
| `ohmaudit-worker-integrations`  | External webhook and integration job boundary                     |
| `ohmaudit-infra`                | Cloudflare/Supabase environment and deployment definitions        |
| `ohmaudit-docs`                 | Product and architecture documentation and ADRs                   |

See [DEVELOPMENT.md](DEVELOPMENT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PUBLISHING.md](PUBLISHING.md), and `ohmaudit-docs/ROADMAP.md` for the current development and deployment guidance.

## Repository setup

The repository is intended to remain private while the prototype is under development. Before the first push:

1. Create an empty private repository without generating another README or `.gitignore`.
2. Initialise Git in this directory and make the first commit.
3. Add the private remote and push the `main` branch.

```bash
git init -b main
git add .
git status
git commit -m "Initial OhmAudit application"
git remote add origin <YOUR_PRIVATE_REPOSITORY_URL>
git push -u origin main
```

Review `git status` before committing. Real `.env` and `.dev.vars` files, Cloudflare local state, dependencies, generated output, local databases, and private keys are excluded. Commit the supplied `.env.example` and `.dev.vars.example` templates only.

## Quick verification

Use Node 24 and pnpm 11. From the root:

```bash
pnpm install
pnpm verify
```

The root scripts orchestrate projects for convenience. No child project imports parent-level configuration or source files.

## Publishing

Cloudflare secrets must remain in Cloudflare or local ignored files; do not add them to Git. The existing all-in-one release command is documented in [PUBLISHING.md](PUBLISHING.md):

```bash
pnpm publish:cloudflare
```
