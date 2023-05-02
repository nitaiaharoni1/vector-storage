import { IDocument } from '../types/IDocument';
import { IFilterCriteria, IFilterOptions } from '../types/IFilter';

export function filterDocuments(documents: IDocument[], filterOptions?: IFilterOptions): IDocument[] {
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

function matchesCriteria(document: IDocument, criteria: IFilterCriteria): boolean {
  if (criteria.metadata) {
    for (const key in criteria.metadata) {
      if (document.metadata[key] !== criteria.metadata[key]) {
        return false;
      }
    }
  }
  if (criteria.text) {
    const texts = Array.isArray(criteria.text) ? criteria.text : [criteria.text];
    if (!texts.includes(document.text)) {
      return false;
    }
  }
  return true;
}
