import { ICreateEmbeddingResponse } from './types/ICreateEmbeddingResponse';
import { IVectorStorageDocument } from './types/IVectorStorageDocument';
import { IVectorStorageOptions } from './types/IVectorStorageOptions';
import { IVectorStorageSimilaritySearchParams } from './types/IVectorStorageSimilaritySearchParams';
import { calcVectorMagnitude, getCosineSimilarityScore } from './utils/cosineSimilarity';
import { constants } from './constants';
import { filterDocuments } from './utils/filterDocuments';
import { getObjectSizeInMB } from './utils/getObjectSizeInMB';
import axios from 'axios';
import debounce from 'lodash/debounce';

export class VectorStorage {
  private documents: IVectorStorageDocument[] = [];
  private readonly storeKey: string;
  private readonly maxSizeInMB: number;
  private readonly debounceTime: number;
  private readonly openaiModel: string;
  private readonly openaiApiKey: string;
  private readonly debouncedSaveToLocalStorage: () => void;

  constructor(options: IVectorStorageOptions) {
    // Load options from the user and use default values from constants
    this.storeKey = options.storeKey ?? constants.DEFAULT_STORE_KEY;

    if (options.maxSizeInMB && options.maxSizeInMB > 5) {
      throw new Error('Max size in MB cannot be greater than 5.');
    }

    this.maxSizeInMB = options.maxSizeInMB ?? constants.DEFAULT_MAX_SIZE_IN_MB;
    this.debounceTime = options.debounceTime ?? constants.DEFAULT_DEBOUNCE_TIME;
    this.openaiModel = options.openaiModel ?? constants.DEFAULT_OPENAI_MODEL;

    this.loadFromLocalStorage();
    const { openAIApiKey } = options;
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is required.');
    }
    this.openaiApiKey = openAIApiKey;

    // Initialize the debounced save function
    this.debouncedSaveToLocalStorage = debounce(() => {
      this.saveToLocalStorage();
    }, this.debounceTime);
  }

  public async addText(text: string, metadata: object): Promise<IVectorStorageDocument> {
    // Create a document from the text and metadata
    const doc: IVectorStorageDocument = {
      md: metadata, // metadata
      t: text, // text
      ts: Date.now(), // timestamp
      v: [], // vector
      vm: 0, // vecMag
    };
    const docs = await this.addDocuments([doc]);
    return docs[0];
  }

  public async addTexts(texts: string[], metadatas: object[]): Promise<IVectorStorageDocument[]> {
    if (texts.length !== metadatas.length) {
      throw new Error('The lengths of texts and metadata arrays must match.');
    }
    const promises = texts.map(async (text, index) => await this.addText(text, metadatas[index]));
    return await Promise.all(promises);
  }

  public async addDocuments(documents: IVectorStorageDocument[]): Promise<IVectorStorageDocument[]> {
    // filter out already existing documents
    const newDocuments = documents.filter((doc) => !this.documents.some((d) => d.t === doc.t));
    // If there are no new documents, return an empty array
    if (newDocuments.length === 0) {
      return [];
    }
    const newVectors = await this.embedTexts(newDocuments.map((doc) => doc.t));
    // Assign vectors and precompute vector magnitudes for new documents
    newDocuments.forEach((doc, index) => {
      doc.v = newVectors[index];
      doc.vm = calcVectorMagnitude(doc);
    });
    // Add new documents to the store
    this.documents.push(...newDocuments);
    this.removeDocsLRU();
    // Save to local storage
    this.debouncedSaveToLocalStorage();
    return newDocuments;
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    const response = await axios.post<ICreateEmbeddingResponse>(
      constants.OPENAI_API_URL, // Use constant for OpenAI API URL
      {
        input: texts,
        model: this.openaiModel,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data.data.map((item) => item.embedding);
  }

  private async embedText(query: string): Promise<number[]> {
    return (await this.embedTexts([query]))[0];
  }

  async similaritySearch(params: IVectorStorageSimilaritySearchParams): Promise<IVectorStorageDocument[]> {
    const { query, k = 4, filterOptions } = params;
    // Calculate the query vector and its magnitude
    const { queryVector, queryMagnitude } = await this.calculateQueryVectorAndMagnitude(query);
    // Filter documents based on filter options
    const filteredDocuments = filterDocuments(this.documents, filterOptions);
    // Calculate similarity scores for the filtered documents
    const scoresPairs: Array<[IVectorStorageDocument, number]> = this.calculateSimilarityScores(filteredDocuments, queryVector, queryMagnitude);
    const sortedPairs = scoresPairs.sort((a, b) => b[1] - a[1]);
    // Return the top k documents without their similarity scores
    const results = sortedPairs.slice(0, k).map((pair) => pair[0]);
    // Update hit counters for the top k documents
    this.updateHitCounters(results);
    if (results.length > 0) {
      this.removeDocsLRU();
      this.debouncedSaveToLocalStorage();
    }
    return results;
  }

  private async calculateQueryVectorAndMagnitude(query: string | number[]): Promise<{ queryVector: number[]; queryMagnitude: number }> {
    const queryVector = typeof query === 'string' ? await this.embedText(query) : query;
    const queryMagnitude = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
    return { queryMagnitude, queryVector };
  }

  private calculateSimilarityScores(filteredDocuments: IVectorStorageDocument[], queryVector: number[], queryMagnitude: number): Array<[IVectorStorageDocument, number]> {
    return filteredDocuments.map((doc) => {
      const dotProduct = doc.v.reduce((sum, val, i) => sum + val * queryVector[i], 0);
      const score = getCosineSimilarityScore(dotProduct, doc.vm, queryMagnitude);
      return [doc, score];
    });
  }

  private updateHitCounters(results: IVectorStorageDocument[]): void {
    results.forEach((doc) => {
      doc.h = (doc.h ?? 0) + 1; // Update hit counter
    });
  }

  private loadFromLocalStorage(): void {
    const storedData = localStorage.getItem(this.storeKey);
    if (storedData) {
      this.documents = JSON.parse(storedData);
    }
    this.removeDocsLRU();
  }

  private saveToLocalStorage(): void {
    const data = this.documents;
    localStorage.setItem(this.storeKey, JSON.stringify(data));
  }

  private removeDocsLRU(): void {
    if (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
      // Sort documents by hit counter (ascending) and then by timestamp (ascending)
      this.documents.sort((a, b) => (a.h ?? 0) - (b.h ?? 0) || a.ts - b.ts);

      // Remove documents until the size is below the limit
      while (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
        this.documents.shift();
      }
    }
  }
}
