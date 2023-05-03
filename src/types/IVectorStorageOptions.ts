export interface IVectorStorageOptions {
  openAIApiKey: string;
  storeKey?: string;
  maxSizeInMB?: number;
  debounceTime?: number;
  openaiModel?: string;
}
