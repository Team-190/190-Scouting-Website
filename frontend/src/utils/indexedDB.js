// @ts-nocheck
const DB_NAME = "scoutingDB";
const DB_VERSION = 3;

let dbInstance = null;

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
            dbInstance = request.result;
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

// ─── WRITE ──────────────────────────────────────────────────────────────────

export async function setIndexedDBStore(STORE, { rows = null, key = null, value = null } = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);

        if (Array.isArray(rows)) {
            for (const row of rows) {
                const normalized = normalizeRecordForStore(STORE, row);
                if (!normalized) continue;
                store.put(normalized);
            }
        } else if (key !== null && value !== null) {
            store.put({ key, value });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => console.log("transaction aborted", tx.error);
    });
}

// ─── CLEAR ──────────────────────────────────────────────────────────────────

export async function clearIndexedDBStore(STORE) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
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

export async function getIndexedDBStore(STORE, key = null) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        let request;

        if (key !== null) {
            request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value ?? null);
        } else {
            request = store.getAll();
            request.onsuccess = () => resolve(request.result ?? []);
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