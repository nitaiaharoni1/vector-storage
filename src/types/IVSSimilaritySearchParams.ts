import { IVSFilterOptions } from './IVSFilterOptions';

export interface IVSSimilaritySearchParams {
  query: string | number[];
  k?: number;
  filterOptions?: IVSFilterOptions;
}
