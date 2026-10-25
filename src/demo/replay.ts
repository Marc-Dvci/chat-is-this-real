import { readFileSync } from 'node:fs';
import { demoCatalogSchema, type DemoCatalog } from '../shared/schemas.js';
export { recordedDemoOutcome } from './recorded-outcome.js';
export { demoReplay } from './runner.js';

export function loadDemoCatalog(): DemoCatalog {
  const base = demoCatalogSchema.parse(JSON.parse(readFileSync(new URL('../../fixtures/demo/catalog.json', import.meta.url), 'utf8')));
  const showcase = demoCatalogSchema.parse(JSON.parse(readFileSync(new URL('../../fixtures/demo/showcase.json', import.meta.url), 'utf8')));
  return { ...base, cases: [...base.cases, ...showcase.cases] };
}
