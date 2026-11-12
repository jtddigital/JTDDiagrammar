import type { Style } from '../../ir/types.ts';
import { merged, ruled } from '../section-styles.ts';
import type { LcState, Lifecycle } from './model.ts';

/** Default header and pill colours by state type; styles override them (URS-TYP-009). */
const TYPE_FILL = {
  default: { initial: '#dbeafe', final: '#dcfce7', cancelled: '#fee2e2' },
  dark: { initial: '#1e3a5f', final: '#14532d', cancelled: '#4c1d1d' },
} as const;

/** A state's style: type colour, section default, style by type, its own. */
export const stateStyle = (m: Lifecycle, s: LcState): Style | undefined => {
  const t = s.stateType ?? 'steady';
  const fill = t === 'steady' ? undefined : TYPE_FILL[m.theme ?? 'default'][t];
  return merged(merged(merged(fill && { fill }, m.styles?.states), ruled(m.styleBy, { stateType: t })), s.style);
};

