"use client";

/**
 * Keeps recorded voice notes on the device so they can be played back.
 *
 * The recording itself never reaches the agent — it is transcribed first and the
 * *text* is what the durable session stores (see app/api/transcribe/route.ts).
 * That is the right trade for the model, but it would otherwise mean a voice
 * question disappears the moment it is sent. So the blob is kept here, in
 * IndexedDB, and re-attached to its bubble when the transcript is replayed from
 * the session stream after a reload.
 *
 * The join key is the transcript text: it is what both the local record and the
 * rebuilt bubble have in common, it survives the session being re-streamed from
 * index 0, and the only collision it can produce — asking the exact same
 * sentence twice — plays back an identical recording anyway.
 *
 * Everything here degrades to a no-op: a browser without IndexedDB (or in
 * private mode) simply shows the transcript without a player.
 */

const DB_NAME = "japan2026-voice";
const DB_VERSION = 1;
const STORE = "notes";
/** Old recordings are pruned so a long trip cannot fill the device quota. */
const KEEP = 60;

export type VoiceNote = {
  key: string;
  blob: Blob;
  mediaType: string;
  durationMs: number;
  at: number;
};

/** Stable join key for a transcript. Whitespace and final punctuation vary. */
export function voiceKey(transcript: string): string {
  return transcript.replace(/\s+/g, " ").trim().replace(/[.!?…]+$/u, "").slice(0, 300);
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveVoiceNote(note: VoiceNote): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    tx(db, "readwrite").put(note);
  } catch {
    // Quota or a closed connection — playback is a nicety, never a blocker.
    return;
  }

  void prune(db);
}

/** Drops the oldest recordings once the store grows past `KEEP`. */
async function prune(db: IDBDatabase): Promise<void> {
  try {
    const store = tx(db, "readwrite");
    const counter = store.count();
    counter.onsuccess = () => {
      const excess = counter.result - KEEP;
      if (excess <= 0) return;

      let removed = 0;
      const cursor = store.index("at").openCursor();
      cursor.onsuccess = () => {
        const handle = cursor.result;
        if (!handle || removed >= excess) return;
        handle.delete();
        removed += 1;
        handle.continue();
      };
    };
  } catch {
    // Nothing to do: the store simply keeps a few more recordings than planned.
  }
}

async function readVoiceNote(key: string): Promise<VoiceNote | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const request = tx(db, "readonly").get(key);
      request.onsuccess = () => resolve((request.result as VoiceNote | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Object URLs are cached per key: a bubble re-renders far more often than it changes. */
const urlCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Playable URL for a transcript's recording, or `null` when this device never
 * held it (someone else's phone, a cleared store, a typed question).
 */
export function voiceNoteUrl(key: string): Promise<string | null> {
  const cached = urlCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = readVoiceNote(key)
    .then((note) => {
      const url = note ? URL.createObjectURL(note.blob) : null;
      urlCache.set(key, url);
      return url;
    })
    .catch(() => {
      urlCache.set(key, null);
      return null;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Lets a just-recorded note play instantly, before it is read back from disk. */
export function primeVoiceNoteUrl(key: string, blob: Blob): string {
  const existing = urlCache.get(key);
  if (existing) return existing;

  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}
