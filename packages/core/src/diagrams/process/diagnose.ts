import { error, warning, type Diagnostic } from '../../diagnostics.ts';
import { checkModel, type Finding } from './checks.ts';
import type { ProcessModel } from './model.ts';
import { profiles } from './profiles.ts';

const REGISTRY = profiles();

/**
 * The process model's checks as diagnostics (URS-PM-017): `process.<check>` at the element's source, warnings
 * except profile conformance, which is an error. `skip` leaves out checks the type already makes itself.
 */
export function processDiagnostics(m: ProcessModel, skip: readonly Finding['code'][] = []): Diagnostic[] {
  const profile = REGISTRY.get(m.profile);
  if (!profile) return [error('process.profile', `unknown profile '${m.profile}'`)];
  return checkModel(m, profile, REGISTRY)
    .filter((f) => !skip.includes(f.code))
    .map((f) => (f.code === 'profile' ? error : warning)(`process.${f.code}`, f.message, f.src ?? ''));
}
