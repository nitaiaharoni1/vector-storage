import { IVSDocument } from './types/IVSDocument';
import Dexie from 'dexie';

export class VectorStorageDatabase extends Dexie {
  documents: Dexie.Table<IVSDocument, string>;

  constructor() {
    super('VectorStorageDatabase');
    this.version(1).stores({
      documents: '++id, text, metadata, timestamp, vector, vectorMag, hits',
    });

    this.documents = this.table('documents');
  }
}
