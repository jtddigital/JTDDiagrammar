/** What a Compare pane shows (URS-WS-032): two sides, each a file's saved version or its current text. */
export interface Side {
  file: string;
  /** Version number; absent for the current text, unsaved edits included. */
  version?: number;
}

export interface Comparison {
  a: Side;
  b: Side;
}
