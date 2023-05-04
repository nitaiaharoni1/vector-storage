import { IVSDocument } from './types/IVSDocument';
import { IVSFilterCriteria, IVSFilterOptions } from './types/IVSFilterOptions';

export function calcVectorMagnitude(doc: IVSDocument): number {
  return Math.sqrt(doc.v.reduce((sum, val) => sum + val * val, 0));
}

export function getCosineSimilarityScore(dotProduct: number, magnitudeA: number, magnitudeB: number): number {
  return dotProduct / (magnitudeA * magnitudeB);
}

export function filterDocuments(documents: IVSDocument[], filterOptions?: IVSFilterOptions): IVSDocument[] {
  let filteredDocuments = documents;
  if (filterOptions) {
    if (filterOptions.include) {
      filteredDocuments = filteredDocuments.filter((doc) => matchesCriteria(doc, filterOptions.include!));
    }
    if (filterOptions.exclude) {
      filteredDocuments = filteredDocuments.filter((doc) => !matchesCriteria(doc, filterOptions.exclude!));
    }
  }
  return filteredDocuments;
}

function matchesCriteria(document: IVSDocument, criteria: IVSFilterCriteria): boolean {
  if (criteria.metadata) {
    for (const key in criteria.metadata) {
      // @ts-expect-error
      if (document.md[key] !== criteria.metadata[key]) {
        return false;
      }
    }
  }
  if (criteria.text) {
    const texts = Array.isArray(criteria.text) ? criteria.text : [criteria.text];
    if (!texts.includes(document.t)) {
      return false;
    }
  }
  return true;
}

export function getObjectSizeInMB(obj: object): number {
  const bytes = JSON.stringify(obj).length;
  const kilobytes = bytes / 1024;
  return kilobytes / 1024;
}

// export function cosineSimilarity(vecA: number[], vecB: number[]): number {
//   const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
//   const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
//   const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
//   return getCosineSimilarityScore(dotProduct, magnitudeA, magnitudeB);
// }
