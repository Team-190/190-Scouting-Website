// @ts-nocheck
const DB_NAME = "scoutingDB";
const DB_VERSION = 5;

// ─── OPEN / INIT ────────────────────────────────────────────────────────────

let dbInstance = null;

const STORE_LIST = ["matchAlliances", "teams", "eventDetails", "teamStatuses", "OPR", "alliances", "EPA", "elimsStarted", "matchScores"];

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains("scoutingData")) {
                db.createObjectStore("scoutingData", { keyPath: "Id" });
            }
            
            for (const store of STORE_LIST) {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store, { keyPath: "key" });
                }
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onerror = () => reject(request.error);
    });
}

// ─── WRITE ──────────────────────────────────────────────────────────────────

export async function setIndexedDBStore(STORE, { rows = null, key = null, value = null } = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);

        if (rows) {
            for (const row of rows) {
                store.put(row);
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
            // Single record lookup — unwrap the value field
            request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value ?? null);
        } else {
            // Full store dump — return raw array (used for scoutingData)
            request = store.getAll();
            request.onsuccess = () => resolve(request.result ?? []);
        }

        request.onerror = () => reject(request.error);
    });
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

// Get the highest Id stored (used for incremental fetching)
export async function getLastId(data) {
    if (!data.length) return 0;
    return Math.max(...data.map(r => r.Id));
}