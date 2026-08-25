export const capabilities = [
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

export type Capability = (typeof capabilities)[number];

export interface CapabilityDefinition {
  key: Capability;
  group: string;
  name: string;
  description: string;
  sensitive?: boolean;
}

export const capabilityCatalogue: CapabilityDefinition[] = [
  {
    key: 'customers.read',
    group: 'Clients and sites',
    name: 'View clients',
    description: 'View client records and contacts.',
  },
  {
    key: 'customers.manage',
    group: 'Clients and sites',
    name: 'Manage clients',
    description: 'Create and edit clients and their contacts.',
  },
  {
    key: 'sites.read',
    group: 'Clients and sites',
    name: 'View sites',
    description: 'View sites, site details and reports.',
  },
  {
    key: 'sites.manage',
    group: 'Clients and sites',
    name: 'Manage sites',
    description: 'Create and edit sites, contacts and site media.',
  },
  {
    key: 'assets.read',
    group: 'Assets',
    name: 'View assets',
    description: 'View assets and their technical information.',
  },
  {
    key: 'assets.manage',
    group: 'Assets',
    name: 'Manage assets',
    description: 'Create, edit and change the lifecycle of assets.',
  },
  {
    key: 'visits.create',
    group: 'Visits',
    name: 'Create visits',
    description: 'Plan visits and select assets for inspection.',
  },
  {
    key: 'visits.assign',
    group: 'Visits',
    name: 'Assign visits',
    description: 'Assign visits to engineers and guest engineers.',
  },
  {
    key: 'inspections.perform',
    group: 'Inspections',
    name: 'Perform inspections',
    description: 'Record and submit inspection results.',
  },
  {
    key: 'inspections.review',
    group: 'Inspections',
    name: 'Review inspections',
    description: 'Review submitted inspections and proposed asset changes.',
  },
  {
    key: 'inspections.approve',
    group: 'Inspections',
    name: 'Approve inspections',
    description: 'Approve or reject inspection revisions.',
    sensitive: true,
  },
  {
    key: 'certificates.generate',
    group: 'Reports',
    name: 'Generate certificates',
    description: 'Generate draft certificates and visit reports.',
  },
  {
    key: 'certificates.issue',
    group: 'Reports',
    name: 'Issue certificates',
    description: 'Issue final certificates and reports.',
    sensitive: true,
  },
  {
    key: 'ev.remote-control',
    group: 'EV charging',
    name: 'Remote control',
    description: 'Operate supported EV equipment remotely.',
    sensitive: true,
  },
  {
    key: 'billing.manage',
    group: 'Administration',
    name: 'Manage billing',
    description: 'Manage subscription and billing settings.',
    sensitive: true,
  },
  {
    key: 'organisation.manage',
    group: 'Administration',
    name: 'Manage organisation',
    description: 'Edit organisation branding, settings and accreditations.',
    sensitive: true,
  },
  {
    key: 'organisation.users.manage',
    group: 'Administration',
    name: 'Manage users and roles',
    description: 'Invite users, assign roles and configure permissions.',
    sensitive: true,
  },
];

const readOnly: Capability[] = ['customers.read', 'sites.read', 'assets.read'];
const engineer: Capability[] = [...readOnly, 'inspections.perform'];
const office: Capability[] = [
  ...readOnly,
  'customers.manage',
  'sites.manage',
  'assets.manage',
  'visits.create',
  'visits.assign',
  'certificates.generate',
];

export const defaultRoles = [
  {
    key: 'organisation-owner',
    name: 'Organisation Owner',
    privileged: true,
    capabilities: [...capabilities],
  },
  {
    key: 'organisation-administrator',
    name: 'Organisation Administrator',
    privileged: true,
    capabilities: capabilities.filter((item) => item !== 'billing.manage'),
  },
  {
    key: 'contract-manager',
    name: 'Contract Manager',
    privileged: false,
    capabilities: [...office, 'inspections.review', 'inspections.approve', 'certificates.issue'],
  },
  {
    key: 'office-administrator',
    name: 'Office Administrator',
    privileged: false,
    capabilities: office,
  },
  { key: 'engineer', name: 'Engineer', privileged: false, capabilities: engineer },
  { key: 'read-only', name: 'Read Only', privileged: false, capabilities: readOnly },
] as const;
