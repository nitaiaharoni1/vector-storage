export interface IDocument {
  h?: number; // hits (optional, omit if 0)
  md: object; // metadata
  t: string; // text
  ts: number; // timestamp
  vm: number; // vecMag
  v: number[]; // vector
}
