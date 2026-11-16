import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The app's own folder: in an installed copy, `JTD_HOME/versions/<tag>`. */
export const APP_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const file = new URL('../../../VERSION', import.meta.url);
/** The installed release (its VERSION file); undefined in a source checkout (URS-NF-011). */
export const VERSION = existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined;
