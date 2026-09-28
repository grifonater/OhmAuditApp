import { z } from 'zod';

const webOrigin = z.url().refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === ''
  );
}, 'Expected an HTTP(S) origin without a path, query, or fragment');

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'development', 'staging', 'production']),
  APP_VERSION: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  WEB_APP_URL: z.url().optional(),
  PUBLIC_WEB_ORIGIN: webOrigin,
  ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1).optional(),
  HYPERDRIVE: z.object({ connectionString: z.string().min(1) }).optional(),
  MEDIA_BUCKET: z.custom<R2Bucket>().optional(),
  INTERNAL_SERVICE_TOKEN: z.string().min(24).optional(),
  SUPERADMIN_BOOTSTRAP_TOKEN: z.string().min(24).optional(),
  PDF_WORKER: z.custom<Fetcher>().optional(),
  PDF_WORKER_URL: z.url().optional(),
  AI_WORKER: z.custom<Fetcher>().optional(),
  EMAIL: z.custom<SendEmail>().optional(),
  EMAIL_FROM_ADDRESS: z.email().optional(),
  EMAIL_FROM_NAME: z.string().min(1).max(200).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_ZONE_ID: z.string().min(1).optional(),
});

export type ApiBindings = z.infer<typeof environmentSchema>;

export function parseEnvironment(bindings: ApiBindings): ApiBindings {
  return environmentSchema.parse(bindings);
}
