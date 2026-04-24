// @ts-nocheck
import { compressData, decompressData } from './compression.js';

const DB_NAME = "scoutingDB";
const DB_VERSION = 5; // Bumped for compression protocol update and storage migration

let dbInstance = null;
let schemaRepairAttempted = false;

const STORE_CONFIG = {
    scoutingData: { keyPath: "Id" },
    matchAlliances: { keyPath: "key" },
    teams: { keyPath: "key" },
    eventDetails: { keyPath: "key" },
    teamStatuses: { keyPath: "key" },
    OPR: { keyPath: "key" },
    alliances: { keyPath: "key" },
    EPA: { keyPath: "key" },
    elimsStarted: { keyPath: "key" },
    matchScores: { keyPath: "key" },
    retrievePit: { keyPath: "key" },
    retrieveQual: { keyPath: "key" },
    COPR: { keyPath: "key" },
    metricsCache: { keyPath: "key" },
};

const STORE_LIST = Object.keys(STORE_CONFIG).filter((name) => name !== "scoutingData");

function getExpectedKeyPath(storeName) {
    return STORE_CONFIG[storeName]?.keyPath ?? null;
}

function normalizeScoutingRow(row) {
    if (!row || typeof row !== "object") return null;

    const normalized = { ...row };
    if (normalized.Id == null && normalized.ID != null) normalized.Id = normalized.ID;
    if (normalized.Id == null && normalized.id != null) normalized.Id = normalized.id;

    if (normalized.Id == null) return null;
    return normalized;
}

function normalizeRecordForStore(storeName, row) {
    if (!row || typeof row !== "object") return null;
    if (storeName === "scoutingData") return normalizeScoutingRow(row);

    if (row.key == null) return null;
    return row;
}

function createStore(db, storeName) {
    const keyPath = getExpectedKeyPath(storeName);
    if (!keyPath) return;
    db.createObjectStore(storeName, { keyPath });
}

function ensureStoreSchema(db, tx, storeName) {
    const expectedKeyPath = getExpectedKeyPath(storeName);
    if (!expectedKeyPath) return;

    if (!db.objectStoreNames.contains(storeName)) {
        createStore(db, storeName);
        return;
    }

    const existingStore = tx.objectStore(storeName);
    const existingKeyPath = existingStore.keyPath;

    if (existingKeyPath === expectedKeyPath) {
        return;
    }

    db.deleteObjectStore(storeName);
    createStore(db, storeName);
}

function findMissingStores(db) {
    return Object.keys(STORE_CONFIG).filter((name) => !db.objectStoreNames.contains(name));
}

function deleteDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }

    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("IndexedDB delete blocked by another open tab"));
    });
}

// ─── OPEN / INIT ─────────────────────────────────────────────────────────────

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            const tx = request.transaction;

            for (const name of [...db.objectStoreNames]) {
                if (!STORE_CONFIG[name]) {
                    db.deleteObjectStore(name);
                }
            }

            for (const storeName of Object.keys(STORE_CONFIG)) {
                ensureStoreSchema(db, tx, storeName);
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            const missingStores = findMissingStores(db);

            if (missingStores.length > 0 && !schemaRepairAttempted) {
                schemaRepairAttempted = true;
                db.close();
                dbInstance = null;

                deleteDatabase()
                    .then(() => openDB())
                    .then(resolve)
                    .catch(reject);
                return;
            }

            dbInstance = db;
            dbInstance.onversionchange = () => {
                dbInstance.close();
                dbInstance = null;
            };
            resolve(dbInstance);
        };

        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another open tab"));
    });
}

export function closeDB() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

// ─── WRITE ──────────────────────────────────────────────────────────────────

export async function setIndexedDBStore(STORE, { rows = null, key = null, value = null } = {}) {
    const db = await openDB();

    if (!db.objectStoreNames.contains(STORE)) {
        console.warn(`[IndexedDB] Missing store: ${STORE}. Skipping write.`);
        return;
    }

    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(STORE, "readwrite");
        } catch (e) {
            reject(e);
            return;
        }
        const store = tx.objectStore(STORE);
        const keyPath = getExpectedKeyPath(STORE);

        if (Array.isArray(rows)) {
            for (const row of rows) {
                const normalized = normalizeRecordForStore(STORE, row);
                if (!normalized) continue;
                
                // Compress complex data while preserving key fields
                const toStore = { ...normalized };
                for (const [prop, val] of Object.entries(toStore)) {
                    // Skip the key path property to keep indexing working
                    if (prop === keyPath) continue;
                    // Compress objects and complex values
                    if (typeof val === 'object' && val !== null) {
                        toStore[prop] = compressData(val);
                    }
                }
                store.put(toStore);
            }
        } else if (key !== null && value !== null) {
            // For key/value stores, compress the value
            const compressedValue = typeof value === 'object' && value !== null ? compressData(value) : value;
            store.put({ key, value: compressedValue });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => console.log("transaction aborted", tx.error);
    });
}

// ─── CLEAR ──────────────────────────────────────────────────────────────────

export async function clearIndexedDBStore(STORE) {
    const db = await openDB();

    if (!db.objectStoreNames.contains(STORE)) {
        return;
    }

    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(STORE, "readwrite");
        } catch (e) {
            reject(e);
            return;
        }
        const store = tx.objectStore(STORE);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearAllStores() {
    for (const store of STORE_LIST) {
        await clearIndexedDBStore(store);
    }
    await clearIndexedDBStore("scoutingData");
}

// ─── READ ────────────────────────────────────────────────────────────────────

/**
 * Recursively decompress any compressed properties in an object
 */
function decompressObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const decompressed = { ...obj };
    for (const [key, val] of Object.entries(decompressed)) {
        if (val && typeof val === 'object' && val.__compressed) {
            decompressed[key] = decompressData(val);
        }
    }
    return decompressed;
}

export async function getIndexedDBStore(STORE, key = null) {
    const db = await openDB();

    if (!db.objectStoreNames.contains(STORE)) {
        return key !== null ? null : [];
    }

    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(STORE, "readonly");
        } catch (e) {
            reject(e);
            return;
        }
        const store = tx.objectStore(STORE);
        let request;

        if (key !== null) {
            request = store.get(key);
            request.onsuccess = () => {
                const result = request.result?.value ?? null;
                // Decompress if it's stored in compressed format
                resolve(result ? decompressData(result) : null);
            };
        } else {
            request = store.getAll();
            request.onsuccess = () => {
                const results = request.result ?? [];
                // Decompress each item - handle both key/value and row formats
                const decompressed = results.map(item => {
                    if (item.value !== undefined) {
                        // Key/value format - decompress the value property
                        return { ...item, value: decompressData(item.value) };
                    } else {
                        // Row format - decompress any compressed properties
                        return decompressObject(item);
                    }
                });
                resolve(decompressed);
            };
        }

        request.onerror = () => reject(request.error);
    });
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

export async function getLastId(data) {
    if (!Array.isArray(data) || data.length === 0) return 0;

    const ids = data
        .map((row) => Number(row?.Id ?? row?.ID ?? row?.id))
        .filter((id) => Number.isFinite(id));

    if (ids.length === 0) return 0;
    return Math.max(...ids);
}

// ─── METRICS CACHE ──────────────────────────────────────────────────────────

const METRICS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cache computed metrics for an event
 * @param {string} eventCode - The event code (e.g., "2025nhalt1")
 * @param {string[]} metrics - Array of metric names
 */
export async function cacheMetrics(eventCode, metrics) {
    if (!eventCode || !Array.isArray(metrics)) return;
    try {
        await setIndexedDBStore("metricsCache", {
            key: `${eventCode}_metrics`,
            value: {
                eventCode,
                metrics,
                timestamp: Date.now(),
            }
        });
        console.log(`[MetricsCache] Cached ${metrics.length} metrics for ${eventCode}`);
    } catch (e) {
        console.warn("[MetricsCache] Failed to cache metrics:", e);
    }
}

/**
 * Retrieve cached metrics for an event
 * @param {string} eventCode - The event code  
 * @returns {string[] | null} Cached metrics or null if not found/expired
 */
export async function getCachedMetrics(eventCode) {
    if (!eventCode) return null;
    try {
        const cached = await getIndexedDBStore("metricsCache", `${eventCode}_metrics`);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > METRICS_CACHE_TTL) {
            console.log(`[MetricsCache] Metrics cache for ${eventCode} expired`);
            return null;
        }
        
        console.log(`[MetricsCache] Retrieved ${cached.metrics.length} cached metrics for ${eventCode}`);
        return cached.metrics;
    } catch (e) {
        console.warn("[MetricsCache] Failed to retrieve cached metrics:", e);
        return null;
    }
}