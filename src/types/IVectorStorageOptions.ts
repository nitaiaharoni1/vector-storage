export interface IVectorStorageOptions {
  openAIApiKey: string; // The OpenAI API key used for generating embeddings.
  storeKey?: string; // The key used to store data in local storage. Defaults to 'VECTOR_DB'.
  maxSizeInMB?: number; // The maximum size of the storage in megabytes. Defaults to 4.8. Cannot exceed 5.
  debounceTime?: number; // The debounce time in milliseconds for saving to local storage. Defaults to 1000.
  openaiModel?: string; // The OpenAI model used for generating embeddings. Defaults to 'text-embedding-ada-002'.
}
