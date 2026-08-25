import { z } from 'zod';

export const apiErrorSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1),
  correlationId: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal('ok'),
  version: z.string().min(1),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const entitlementStatusSchema = z.enum([
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
]);
export const recordStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const assetStatusSchema = z.enum([
  'PROPOSED',
  'ACTIVE',
  'INACTIVE',
  'REMOVED',
  'DECOMMISSIONED',
  'REPLACED',
]);
export const customerSchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  name: z.string(),
  reference: z.string().nullable(),
  status: recordStatusSchema,
});
export const siteSchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  customerId: z.uuid(),
  name: z.string(),
  postcode: z.string().nullable(),
  status: recordStatusSchema,
});
export const assetSchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  customerId: z.uuid(),
  siteId: z.uuid(),
  assetType: z.string(),
  assetReference: z.string(),
  displayName: z.string(),
  status: assetStatusSchema,
});
