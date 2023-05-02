import { ICreateEmbeddingResponse } from './types/ICreateEmbeddingResponse';
import { IDocument } from './types/IDocument';
import { ISimilaritySearchParams } from './types/ISimilaritySearchParams';
import { IVectorStorageOptions } from './types/IVectorStorageOptions';
import { calcVectorMagnitude, getCosineSimilarityScore } from './utils/cosineSimilarity';
import { filterDocuments } from './utils/filterDocuments';
import { getObjectSizeInMB } from './utils/getObjectSizeInMB';
import axios from 'axios';
import debounce from 'lodash/debounce';

export class VectorStorage {
  private readonly storeKey = 'VECTOR_DB';
  private readonly maxSizeInMB = 4.8; // 4.8 MB
  private readonly debounceTime = 1000; // 1 second
  private documents: IDocument[] = [];
  private readonly openaiApiKey: string;
  private readonly debouncedSaveToLocalStorage = debounce(() => {
    this.saveToLocalStorage();
  }, this.debounceTime);

  constructor(options: IVectorStorageOptions) {
    this.loadFromLocalStorage();
    const { openAIApiKey } = options;
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is required.');
    }
    this.openaiApiKey = openAIApiKey;
  }

  async addText(text: string, metadata: object): Promise<IDocument> {
    // Create a document from the text and metadata
    const doc: IDocument = {
      hits: 0,
      metadata,
      text,
      timestamp: Date.now(),
      vecMag: 0,
      vector: [], // Added hit counter
    };
    console.log(doc);
    const docs = await this.addDocuments([doc]);
    console.log(docs[0]);
    return docs[0];
  }

  async addTexts(texts: string[], metadatas: object[]): Promise<IDocument[]> {
    if (texts.length !== metadatas.length) {
      throw new Error('The lengths of texts and metadata arrays must match.');
    }
    const promises = texts.map(async (text, index) => await this.addText(text, metadatas[index]));
    return await Promise.all(promises);
  }

  async addDocuments(documents: IDocument[]): Promise<IDocument[]> {
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
      doc.vecMag = calcVectorMagnitude(doc);
    });
    // Add new documents to the store
    this.documents.push(...newDocuments);
    this.trimDocuments();
    // Save to local storage
    this.debouncedSaveToLocalStorage();
    return newDocuments;
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    const response = await axios.post<ICreateEmbeddingResponse>(
      'https://api.openai.com/v1/embeddings',
      {
        input: texts,
        model: 'text-embedding-ada-002',
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

  async similaritySearch(params: ISimilaritySearchParams): Promise<IDocument[] | Array<[IDocument, number]>> {
    const { query, k = 4, filterOptions, withScore = false } = params;
    // Calculate the query vector and its magnitude
    const { queryVector, queryMagnitude } = await this.calculateQueryVectorAndMagnitude(query);
    // Filter documents based on filter options
    const filteredDocuments = filterDocuments(this.documents, filterOptions);
    // Calculate similarity scores for the filtered documents
    const scoresPairs: Array<[IDocument, number]> = this.calculateSimilarityScores(filteredDocuments, queryVector, queryMagnitude);
    const sortedPairs = scoresPairs.sort((a, b) => b[1] - a[1]);
    // Return the top k documents with or without their similarity scores based on the withScore parameter
    const results = withScore ? sortedPairs.slice(0, k) : sortedPairs.slice(0, k).map((pair) => pair[0]);
    // Update hit counters for the top k documents
    this.updateHitCounters(results);
    if (results.length > 0) {
      this.trimDocuments();
      this.debouncedSaveToLocalStorage();
    }
    return results;
  }

  private async calculateQueryVectorAndMagnitude(query: string | number[]): Promise<{ queryVector: number[]; queryMagnitude: number }> {
    const queryVector = typeof query === 'string' ? await this.embedText(query) : query;
    const queryMagnitude = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
    return { queryMagnitude, queryVector };
  }

  private calculateSimilarityScores(filteredDocuments: IDocument[], queryVector: number[], queryMagnitude: number): Array<[IDocument, number]> {
    return filteredDocuments.map((doc) => {
      const dotProduct = doc.vector.reduce((sum, val, i) => sum + val * queryVector[i], 0);
      const score = getCosineSimilarityScore(dotProduct, doc.vecMag, queryMagnitude);
      return [doc, score];
    });
  }

  private updateHitCounters(results: IDocument[] | Array<[IDocument, number]>): void {
    results.forEach((doc) => {
      if (Array.isArray(doc)) {
        doc[0].hits += 1;
      } else {
        doc.hits += 1;
      }
    });
  }

  private loadFromLocalStorage(): void {
    const storedData = localStorage.getItem(this.storeKey);
    if (storedData) {
      this.documents = JSON.parse(storedData);
    }
    this.trimDocuments();
  }

  private saveToLocalStorage(): void {
    const data = this.documents;
    localStorage.setItem(this.storeKey, JSON.stringify(data));
  }

  private trimDocuments(): void {
    if (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
      // Sort documents by hit counter (ascending) and then by timestamp (ascending)
      this.documents.sort((a, b) => a.hits - b.hits || a.timestamp - b.timestamp);

      // Remove documents until the size is below the limit
      while (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
        this.documents.shift();
      }
    }
  }
}
