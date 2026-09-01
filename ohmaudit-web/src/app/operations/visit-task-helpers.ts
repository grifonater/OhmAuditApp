import type { AssetSummary, VisitTask, VisitTaskInput } from '../core/api.service';

export type InspectionModuleKey = 'core' | 'ev-charging' | 'thermal-imaging';

export function eligibleTaskAssets(
  assets: AssetSummary[],
  tasks: VisitTask[],
  moduleKey: Exclude<InspectionModuleKey, 'thermal-imaging'>,
  query = '',
): AssetSummary[] {
  const linkedAssetIds = new Set(
    tasks
      .filter((task) => task.moduleKey === moduleKey && task.asset !== undefined)
      .map((task) => task.asset!.id),
  );
  const search = query.trim().toLocaleLowerCase('en-GB');

  return assets.filter(
    (asset) =>
      asset.status === 'ACTIVE' &&
      !linkedAssetIds.has(asset.id) &&
      (moduleKey !== 'ev-charging' || asset.assetType.toLocaleLowerCase('en-GB').includes('ev')) &&
      (!search ||
        [
          asset.displayName,
          asset.assetReference,
          asset.manufacturer,
          asset.model,
          asset.serialNumber,
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase('en-GB').includes(search))),
  );
}

export function buildVisitTaskInputs(
  moduleKey: InspectionModuleKey,
  assets: AssetSummary[],
): VisitTaskInput[] {
  if (moduleKey === 'thermal-imaging') return [{ moduleKey, title: 'Thermal imaging survey' }];

  return assets.map((asset) => ({
    assetId: asset.id,
    moduleKey,
    title: `${asset.displayName} inspection`,
  }));
}
