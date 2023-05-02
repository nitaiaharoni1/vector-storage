export interface IFilterCriteria {
  metadata?: Record<string, any>;
  text?: string | string[];
}

export interface IFilterOptions {
  include?: IFilterCriteria;
  exclude?: IFilterCriteria;
}
