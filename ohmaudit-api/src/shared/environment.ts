import { z } from 'zod';

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'development', 'staging', 'production']),
  APP_VERSION: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  WEB_APP_URL: z.url().optional(),
  ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1).optional(),
  HYPERDRIVE: z.object({ connectionString: z.string().min(1) }).optional(),
  MEDIA_BUCKET: z.custom<R2Bucket>().optional(),
  INTERNAL_SERVICE_TOKEN: z.string().min(24).optional(),
  SUPERADMIN_BOOTSTRAP_TOKEN: z.string().min(24).optional(),
  PDF_WORKER: z.custom<Fetcher>().optional(),
  PDF_WORKER_URL: z.url().optional(),
  AI_WORKER: z.custom<Fetcher>().optional(),
});

export type ApiBindings = z.infer<typeof environmentSchema>;

export function parseEnvironment(bindings: ApiBindings): ApiBindings {
  return environmentSchema.parse(bindings);
}
