export interface IVectorStorageFilterOptions {
  include?: IVectorStorageFilterCriteria;
  exclude?: IVectorStorageFilterCriteria;
}

export interface IVectorStorageFilterCriteria {
  metadata?: Record<string, any>;
  text?: string | string[];
}
