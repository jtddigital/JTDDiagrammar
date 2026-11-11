import { createRegistry as builtins } from '../../core/src/index.ts';
import { checklist } from '../../core/test/fixture-type.ts';

/** Built-ins plus the test-only checklist type, loaded by the API and its workers (URS-EXT-002). */
export const createRegistry = () => builtins().registerType(checklist);
