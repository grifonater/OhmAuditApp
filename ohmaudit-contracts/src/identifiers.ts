import { z } from 'zod';

export const moduleIds = ['core', 'ev-charging', 'emergency-lighting', 'solar-pv'] as const;
export const moduleIdSchema = z.enum(moduleIds);
export type ModuleId = z.infer<typeof moduleIdSchema>;

export const moduleCapabilities = [
  'core.access',
  'ev.assets.manage',
  'ev.inspections.perform',
  'ev.certificates.issue',
  'emergency-lighting.assets.manage',
  'emergency-lighting.inspections.perform',
  'solar.assets.manage',
  'solar.inspections.perform',
] as const;
export const moduleCapabilitySchema = z.enum(moduleCapabilities);
export type ModuleCapability = z.infer<typeof moduleCapabilitySchema>;

export const permissionCapabilities = [
  'customers.read',
  'customers.manage',
  'sites.read',
  'sites.manage',
  'assets.read',
  'assets.manage',
  'visits.create',
  'visits.assign',
  'inspections.perform',
  'inspections.review',
  'inspections.approve',
  'certificates.generate',
  'certificates.issue',
  'ev.remote-control',
  'billing.manage',
  'organisation.manage',
  'organisation.users.manage',
] as const;
export const permissionCapabilitySchema = z.enum(permissionCapabilities);
export type PermissionCapability = z.infer<typeof permissionCapabilitySchema>;
