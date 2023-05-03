import { IVectorStorageDocument } from '../types/IVectorStorageDocument';
import { IVectorStorageFilterCriteria, IVectorStorageFilterOptions } from '../types/IVectorStorageFilterOptions';

export function filterDocuments(documents: IVectorStorageDocument[], filterOptions?: IVectorStorageFilterOptions): IVectorStorageDocument[] {
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

function matchesCriteria(document: IVectorStorageDocument, criteria: IVectorStorageFilterCriteria): boolean {
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
