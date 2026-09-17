import {
  AlarmSmokeIcon,
  BatteryIcon,
  Building01Icon,
  BulbIcon,
  Camera01Icon,
  CctvCameraIcon,
  CircuitBoardIcon,
  DashboardSpeed01Icon,
  DistributionIcon,
  DoorIcon,
  DoorLockIcon,
  ElectricHome01Icon,
  ElectricTower01Icon,
  EvChargerIcon,
  Factory01Icon,
  Fan01Icon,
  FireExtinguisherIcon,
  GasPipeIcon,
  LightbulbIcon,
  PackageIcon,
  PowerServiceIcon,
  PowerSocket01Icon,
  Router01Icon,
  SecurityIcon,
  ServerIcon,
  SolarPanel01Icon,
  TemperatureIcon,
  ToolsIcon,
  WarehouseIcon,
  WaterPumpIcon,
} from '@hugeicons/core-free-icons';
import type { AssetIconKey } from '../core/api.service';

export interface AssetIconOption {
  key: AssetIconKey;
  label: string;
  icon: typeof EvChargerIcon;
}

export const assetIconOptions: readonly AssetIconOption[] = [
  { key: 'ev-charger', label: 'EV charger', icon: EvChargerIcon },
  { key: 'solar-panel', label: 'Solar panel', icon: SolarPanel01Icon },
  { key: 'emergency-light', label: 'Emergency light', icon: BulbIcon },
  { key: 'distribution-board', label: 'Distribution board', icon: DistributionIcon },
  { key: 'battery', label: 'Battery', icon: BatteryIcon },
  { key: 'meter', label: 'Meter', icon: DashboardSpeed01Icon },
  { key: 'general', label: 'General asset', icon: PackageIcon },
  { key: 'fire-alarm', label: 'Fire alarm', icon: AlarmSmokeIcon },
  { key: 'fire-extinguisher', label: 'Fire extinguisher', icon: FireExtinguisherIcon },
  { key: 'cctv', label: 'CCTV', icon: CctvCameraIcon },
  { key: 'access-control', label: 'Access control', icon: DoorLockIcon },
  { key: 'server', label: 'Server', icon: ServerIcon },
  { key: 'network-router', label: 'Network router', icon: Router01Icon },
  { key: 'air-conditioning', label: 'Air conditioning', icon: Fan01Icon },
  { key: 'water-pump', label: 'Water pump', icon: WaterPumpIcon },
  { key: 'gas-system', label: 'Gas system', icon: GasPipeIcon },
  { key: 'generator', label: 'Generator', icon: PowerServiceIcon },
  { key: 'lighting', label: 'Lighting', icon: LightbulbIcon },
  { key: 'socket', label: 'Socket', icon: PowerSocket01Icon },
  { key: 'circuit-board', label: 'Circuit board', icon: CircuitBoardIcon },
  { key: 'security', label: 'Security system', icon: SecurityIcon },
  { key: 'building', label: 'Building', icon: Building01Icon },
  { key: 'factory', label: 'Factory equipment', icon: Factory01Icon },
  { key: 'door', label: 'Door', icon: DoorIcon },
  { key: 'tools', label: 'Tools', icon: ToolsIcon },
  { key: 'boiler', label: 'Boiler or heating', icon: TemperatureIcon },
  { key: 'camera', label: 'Camera', icon: Camera01Icon },
  { key: 'electrical-supply', label: 'Electrical supply', icon: ElectricTower01Icon },
  { key: 'home', label: 'Home system', icon: ElectricHome01Icon },
  { key: 'warehouse', label: 'Warehouse equipment', icon: WarehouseIcon },
];

export function assetIconOption(key: AssetIconKey): AssetIconOption {
  return assetIconOptions.find((option) => option.key === key) ?? assetIconOptions[6]!;
}

export function defaultAssetIconKey(assetType: string): AssetIconKey {
  const type = assetType.toLocaleLowerCase('en-GB');
  if (/\bev\b|electric vehicle|charg(?:e point|er|ing)/u.test(type)) return 'ev-charger';
  if (/solar|photovoltaic|\bpv\b/u.test(type)) return 'solar-panel';
  if (/emergency.*light|light.*emergency/u.test(type)) return 'emergency-light';
  if (/distribution|consumer unit|switchboard|panel|\bdb\b/u.test(type))
    return 'distribution-board';
  if (/battery|storage|\bups\b/u.test(type)) return 'battery';
  if (/meter|monitor/u.test(type)) return 'meter';
  return 'general';
}

export function resolvedAssetIconKey(
  assetType: string,
  iconKey: AssetIconKey | null | undefined,
): AssetIconKey {
  return iconKey ?? defaultAssetIconKey(assetType);
}
