import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Wrangler reads .dev.vars for local Workers, but Prisma runs outside Wrangler.
// Load the same local values first, then fall back to the conventional .env file.
// Existing process environment variables retain precedence over both files.
loadEnvironment({ path: ['.dev.vars', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env['DIRECT_URL'] ??
      process.env['DATABASE_URL'] ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
});
