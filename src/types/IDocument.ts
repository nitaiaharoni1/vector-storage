export interface IDocument {
  vector: number[];
  // id: string;
  text: string;
  vecMag: number;
  metadata: Record<string, any>;
  timestamp: number;
  hits: number;
}
