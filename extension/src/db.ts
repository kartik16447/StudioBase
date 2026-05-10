import { svLog } from './logger';

const DB_NAME = 'screenvault';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

export interface ChunkRecord {
  id?: number;
  sessionId: string;
  index: number;
  blob: Blob;
  timestamp: number;
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = initDB().catch(err => {
      svLog("IDB_OPEN_FAILED", { error: err.message }).catch(() => {});
      throw err;
    });
  }
  return dbPromise;
}

export async function saveChunk(sessionId: string, index: number, blob: Blob): Promise<void> {
  // Task 1 & 6: Guards and validation
  if (!sessionId) {
    console.error('Rejected write: missing sessionId');
    return;
  }
  if (!blob || blob.size === 0) {
    // Ignore empty chunks
    return;
  }

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.add({ 
      sessionId, 
      index, 
      blob, 
      timestamp: Date.now() 
    });

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Task 4: Implement getChunks(sessionId) with ordering guarantee
export async function getChunks(sessionId: string): Promise<Blob[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    const records: { index: number, blob: Blob }[] = [];
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push({
          index: cursor.value.index,
          blob: cursor.value.blob
        });
        cursor.continue();
      } else {
        // Task 3: Retrieval must sort by index ASC
        records.sort((a, b) => a.index - b.index);
        resolve(records.map(r => r.blob));
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Task 5: Implement deleteChunks(sessionId)
export async function deleteChunks(sessionId: string): Promise<void> {
  return deleteSession(sessionId);
}



export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export interface PendingSession {
  sessionId: string;
  chunkCount: number;
  durationEstimateMs: number;
}

export async function getPendingSessions(): Promise<PendingSession[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    
    // Use nextunique to quickly find all unique sessionIds without scanning every chunk
    const request = index.openKeyCursor(null, 'nextunique');
    const sessions: string[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        sessions.push(cursor.key as string);
        cursor.continue();
      } else {
        // Now for each session, we can get its count efficiently
        const results: PendingSession[] = [];
        const promises = sessions.map(sid => getSessionSummary(sid));
        Promise.all(promises).then(summaries => {
          resolve(summaries.filter(s => s.chunkCount > 0));
        }).catch(reject);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function getSessionSummary(sessionId: string): Promise<PendingSession> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    const countRequest = index.count(IDBKeyRange.only(sessionId));

    countRequest.onsuccess = () => {
      resolve({
        sessionId,
        chunkCount: countRequest.result,
        durationEstimateMs: countRequest.result * 1000 // Simple estimate
      });
    };
    countRequest.onerror = () => reject(countRequest.error);
  });
}

export async function recoverSession(sessionId: string): Promise<Blob> {
  const blobs = await getChunks(sessionId);
  if (blobs.length === 0) {
    throw new Error(`No chunks found for session ${sessionId}`);
  }
  return new Blob(blobs, { type: 'video/webm' });
}
