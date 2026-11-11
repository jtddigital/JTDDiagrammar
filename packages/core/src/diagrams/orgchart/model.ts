import type { Direction, Style, Theme } from '../../ir/types.ts';

export interface Person {
  id: string;
  name: string;
  title?: string;
  /** Id of this person's manager; omitted at the top. */
  manager?: string;
  quote?: string;
  style?: Style;
}

export interface OrgChart {
  version: string;
  type: 'orgchart';
  title?: string;
  theme?: Theme;
  direction?: Direction;
  people: Person[];
}
