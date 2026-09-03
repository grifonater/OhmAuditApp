export const moduleCatalogue = [
  {
    key: 'ev-charging',
    name: 'EV Charging',
    description: 'EV charger assets, inspections, tests, certificates and integrations.',
    capabilities: [
      'ev.assets.read',
      'ev.assets.manage',
      'ev.inspections.perform',
      'ev.certificates.issue',
    ],
  },
  {
    key: 'thermal-imaging',
    name: 'Thermal Imaging',
    description: 'Thermal surveys, paired image galleries, findings and client reports.',
    capabilities: [
      'thermal.inspections.perform',
      'thermal.reports.issue',
      'thermal.equipment.read',
      'thermal.equipment.manage',
    ],
  },
  {
    key: 'emergency-lighting',
    name: 'Emergency Lighting',
    description: 'Lighting systems, fittings, functional and duration testing.',
    capabilities: [
      'emergency-lighting.assets.read',
      'emergency-lighting.assets.manage',
      'emergency-lighting.inspections.perform',
      'emergency-lighting.certificates.issue',
    ],
  },
  {
    key: 'solar-pv',
    name: 'Solar PV',
    description: 'Solar systems, topology, inspections and test results.',
    capabilities: ['solar.assets.manage', 'solar.inspections.perform'],
  },
] as const;

export type ModuleKey = (typeof moduleCatalogue)[number]['key'];
