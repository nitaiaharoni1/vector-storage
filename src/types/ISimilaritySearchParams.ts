import { IFilterOptions } from './IFilter';

export interface ISimilaritySearchParams {
  query: string | number[];
  k?: number;
  filterOptions?: IFilterOptions;
}
