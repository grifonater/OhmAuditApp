import { z } from 'zod';

export const assetLifecycleSchema = z.enum([
  'proposed',
  'active',
  'inactive',
  'removed',
  'decommissioned',
  'replaced',
]);
export type AssetLifecycle = z.infer<typeof assetLifecycleSchema>;

export const inspectionLifecycleSchema = z.enum([
  'scheduled',
  'ready',
  'in_progress',
  'submitted',
  'awaiting_review',
  'returned_for_changes',
  'approved',
  'issued',
  'closed',
  'cancelled',
]);
export type InspectionLifecycle = z.infer<typeof inspectionLifecycleSchema>;

export const scheduleOccurrenceStatusSchema = z.enum([
  'future',
  'upcoming',
  'due',
  'overdue',
  'completed',
  'skipped',
  'superseded',
]);
export type ScheduleOccurrenceStatus = z.infer<typeof scheduleOccurrenceStatusSchema>;
