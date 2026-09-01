import { describe, expect, it } from 'vitest';
import type { AssetSummary, VisitTask } from '../src/app/core/api.service';
import { buildVisitTaskInputs, eligibleTaskAssets } from '../src/app/operations/visit-task-helpers';

const evAsset: AssetSummary = {
  id: 'ev-1',
  assetType: 'EV Charger',
  assetReference: 'CP-1',
  displayName: 'Front charger',
  manufacturer: 'Ohm',
  status: 'ACTIVE',
};
const panelAsset: AssetSummary = {
  id: 'panel-1',
  assetType: 'Distribution board',
  assetReference: 'DB-1',
  displayName: 'Main panel',
  status: 'ACTIVE',
};
const archivedAsset: AssetSummary = {
  id: 'ev-archived',
  assetType: 'EV Charger',
  assetReference: 'CP-2',
  displayName: 'Old charger',
  status: 'ARCHIVED',
};
const assets = [evAsset, panelAsset, archivedAsset];

const tasks: VisitTask[] = [
  {
    id: 'task-1',
    title: 'Front charger inspection',
    moduleKey: 'ev-charging',
    status: 'PENDING',
    asset: evAsset,
  },
];

describe('visit task helpers', () => {
  it('filters inactive, duplicate, and non-EV assets for EV tasks', () => {
    expect(eligibleTaskAssets(assets, tasks, 'ev-charging')).toEqual([]);
  });

  it('allows the same asset for another module and searches asset fields', () => {
    expect(eligibleTaskAssets(assets, tasks, 'core', 'ohm')).toEqual([evAsset]);
    expect(eligibleTaskAssets(assets, tasks, 'core', 'db-1')).toEqual([panelAsset]);
  });

  it('builds asset and site-wide task input', () => {
    expect(buildVisitTaskInputs('core', [panelAsset])).toEqual([
      { assetId: 'panel-1', moduleKey: 'core', title: 'Main panel inspection' },
    ]);
    expect(buildVisitTaskInputs('thermal-imaging', [])).toEqual([
      { moduleKey: 'thermal-imaging', title: 'Thermal imaging survey' },
    ]);
  });
});
