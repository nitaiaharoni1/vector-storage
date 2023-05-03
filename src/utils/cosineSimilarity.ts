import { IDocument } from '../types/IDocument';

export function calcVectorMagnitude(doc: IDocument): number {
  return Math.sqrt(doc.v.reduce((sum, val) => sum + val * val, 0));
}

export function getCosineSimilarityScore(dotProduct: number, magnitudeA: number, magnitudeB: number): number {
  return dotProduct / (magnitudeA * magnitudeB);
}

// export function cosineSimilarity(vecA: number[], vecB: number[]): number {
//   const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
//   const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
//   const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
//   return getCosineSimilarityScore(dotProduct, magnitudeA, magnitudeB);
// }
