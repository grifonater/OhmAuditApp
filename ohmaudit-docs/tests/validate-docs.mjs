import { access, readFile } from 'node:fs/promises';

const required = [
  'PRODUCT.md', 'ARCHITECTURE.md', 'DOMAIN-MODEL.md', 'MULTITENANCY.md', 'AUTHORIZATION.md',
  'OFFLINE-SYNC.md', 'SCHEDULING.md', 'DOCUMENTS.md', 'MODULE-SYSTEM.md', 'EV-MODULE.md',
  'EMERGENCY-LIGHTING-MODULE.md', 'SOLAR-MODULE.md', 'INTEGRATIONS.md', 'BILLING.md',
  'SECURITY.md', 'DEPLOYMENT.md', 'ROADMAP.md',
];

await Promise.all(required.map((file) => access(new URL(`../${file}`, import.meta.url))));
const roadmap = await readFile(new URL('../ROADMAP.md', import.meta.url), 'utf8');
if (!roadmap.includes('[x] Milestone 0')) throw new Error('ROADMAP.md must record Milestone 0 status.');
console.log(`Validated ${required.length} required architecture documents.`);

