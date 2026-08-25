import { z } from 'zod';

export const deploymentEnvironmentSchema = z.enum([
  'local',
  'development',
  'staging',
  'production',
]);
export type DeploymentEnvironment = z.infer<typeof deploymentEnvironmentSchema>;

export function resourceName(service: string, environment: DeploymentEnvironment): string {
  const safeService = z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .parse(service);
  return `ohmaudit-${safeService}-${environment}`;
}
