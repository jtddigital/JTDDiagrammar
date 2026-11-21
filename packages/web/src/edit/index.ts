/**
 * Direct editing from the diagram: an isolated experiment (D-009, URS-WEB-025..031).
 *
 * Everything lives in this folder. To remove the experiment:
 * 1. delete `packages/web/src/edit/`;
 * 2. in `App.tsx`, remove the `useEdit` call, the `details` pane entry, `{edit.bar}`, `{...edit.preview}`
 *    and `edit.pick(...)` in the click handler (each marked "Direct editing"); Preview's generic props can stay;
 * 3. in `workspace/layout.ts` and `Toolbar.tsx`, remove the `details` pane id and label;
 * 4. optionally, remove the `edit` assets from the diagram types and `EditAssets` from core (nothing else uses them).
 */
import './edit.css';

export { useEdit, type Edit } from './useEdit.tsx';
