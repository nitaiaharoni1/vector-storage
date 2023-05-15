import { ICreateEmbeddingResponse } from './types/ICreateEmbeddingResponse';
import { IVSDocument, IVSSimilaritySearchResponse } from './types/IVSDocument';
import { IVSOptions } from './types/IVSOptions';
import { IVSSimilaritySearchParams } from './types/IVSSimilaritySearchParams';
import { VectorStorageDatabase } from './VectorStorageDatabase';
import { calcVectorMagnitude, debounce, filterDocuments, getCosineSimilarityScore, getObjectSizeInMB } from './helpers';
import { constants } from './constants';

export class VectorStorage {
  private documents: IVSDocument[] = [];
  private readonly db = new VectorStorageDatabase();
  private readonly maxSizeInMB: number;
  private readonly debounceTime: number;
  private readonly openaiModel: string;
  private readonly openaiApiKey: string;
  private readonly debouncedSaveToIndexDbStorage: () => void;

  constructor(options: IVSOptions) {
    // Load options from the user and use default values from constants
    this.maxSizeInMB = options.maxSizeInMB ?? constants.DEFAULT_MAX_SIZE_IN_MB;
    this.debounceTime = options.debounceTime ?? constants.DEFAULT_DEBOUNCE_TIME;
    this.openaiModel = options.openaiModel ?? constants.DEFAULT_OPENAI_MODEL;

    this.loadFromIndexDbStorage();
    const { openAIApiKey } = options;
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is required.');
    }
    this.openaiApiKey = openAIApiKey;

    this.debouncedSaveToIndexDbStorage = this.debounceTime
      ? debounce(async () => {
          await this.saveToIndexDbStorage();
        }, this.debounceTime)
      : async () => {
          await this.saveToIndexDbStorage();
        };
  }

  public async addText(text: string, metadata: object): Promise<IVSDocument> {
    // Create a document from the text and metadata
    const doc: IVSDocument = {
      metadata,
      text,
      timestamp: Date.now(),
      vector: [],
      vectorMag: 0,
    };
    const docs = await this.addDocuments([doc]);
    return docs[0];
  }

  public async addTexts(texts: string[], metadatas: object[]): Promise<IVSDocument[]> {
    if (texts.length !== metadatas.length) {
      throw new Error('The lengths of texts and metadata arrays must match.');
    }
    const promises = texts.map(async (text, index) => await this.addText(text, metadatas[index]));
    return await Promise.all(promises);
  }

  private async addDocuments(documents: IVSDocument[]): Promise<IVSDocument[]> {
    // filter out already existing documents
    const newDocuments = documents.filter((doc) => !this.documents.some((d) => d.text === doc.text));
    // If there are no new documents, return an empty array
    if (newDocuments.length === 0) {
      return [];
    }
    const newVectors = await this.embedTexts(newDocuments.map((doc) => doc.text));
    // Assign vectors and precompute vector magnitudes for new documents
    newDocuments.forEach((doc, index) => {
      doc.vector = newVectors[index];
      doc.vectorMag = calcVectorMagnitude(doc);
    });
    // Add new documents to the store
    this.documents.push(...newDocuments);
    this.removeDocsLRU();
    // Save to index db storage
    await this.debouncedSaveToIndexDbStorage();
    return newDocuments;
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    const response = await fetch(constants.OPENAI_API_URL, {
      body: JSON.stringify({
        input: texts,
        model: this.openaiModel,
      }),
      headers: {
        Authorization: `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = (await response.json()) as ICreateEmbeddingResponse;
    return responseData.data.map((data) => data.embedding);
  }

  private async embedText(query: string): Promise<number[]> {
    return (await this.embedTexts([query]))[0];
  }

  async similaritySearch(params: IVSSimilaritySearchParams): Promise<IVSSimilaritySearchResponse[]> {
    const { query, k = 4, filterOptions } = params;
    // Calculate the query vector and its magnitude
    const { queryVector, queryMagnitude } = await this.calculateQueryVectorAndMagnitude(query);
    // Filter documents based on filter options
    const filteredDocuments = filterDocuments(this.documents, filterOptions);
    // Calculate similarity scores for the filtered documents
    const scoresPairs: Array<[IVSDocument, number]> = this.calculateSimilarityScores(filteredDocuments, queryVector, queryMagnitude);
    const sortedPairs = scoresPairs.sort((a, b) => b[1] - a[1]);
    // Return the top k documents with their similarity scores
    const results = sortedPairs.slice(0, k).map((pair) => ({ ...pair[0], score: pair[1] }));
    // Update hit counters for the top k documents
    this.updateHitCounters(results);
    if (results.length > 0) {
      this.removeDocsLRU();
      await this.debouncedSaveToIndexDbStorage();
    }
    return results;
  }

  private async calculateQueryVectorAndMagnitude(query: string | number[]): Promise<{ queryVector: number[]; queryMagnitude: number }> {
    const queryVector = typeof query === 'string' ? await this.embedText(query) : query;
    const queryMagnitude = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
    return { queryMagnitude, queryVector };
  }

  private calculateSimilarityScores(filteredDocuments: IVSDocument[], queryVector: number[], queryMagnitude: number): Array<[IVSDocument, number]> {
    return filteredDocuments.map((doc) => {
      const dotProduct = doc.vector.reduce((sum, val, i) => sum + val * queryVector[i], 0);
      const score = getCosineSimilarityScore(dotProduct, doc.vectorMag, queryMagnitude);
      return [doc, score];
    });
  }

  private updateHitCounters(results: IVSDocument[]): void {
    results.forEach((doc) => {
      doc.hits = (doc.hits ?? 0) + 1; // Update hit counter
    });
  }

  private async loadFromIndexDbStorage(): Promise<void> {
    const storedData = await this.db.documents.toArray();
    if (storedData) {
      this.documents = storedData;
    }
    this.removeDocsLRU();
  }

  private async saveToIndexDbStorage(): Promise<void> {
    await this.db.documents.clear();
    await this.db.documents.bulkAdd(this.documents);
  }

  private removeDocsLRU(): void {
    if (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
      // Sort documents by hit counter (ascending) and then by timestamp (ascending)
      this.documents.sort((a, b) => (a.hits ?? 0) - (b.hits ?? 0) || a.timestamp - b.timestamp);

      // Remove documents until the size is below the limit
      while (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
        this.documents.shift();
      }
    }
  }
}
