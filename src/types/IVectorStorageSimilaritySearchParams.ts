import { IVectorStorageFilterOptions } from './IVectorStorageFilterOptions';

export interface IVectorStorageSimilaritySearchParams {
  query: string | number[];
  k?: number;
  filterOptions?: IVectorStorageFilterOptions;
}
