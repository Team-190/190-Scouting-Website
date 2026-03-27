// @ts-nocheck
const DB_NAME = 'scoutingDB';
const DB_VERSION = 1;

let dbInstance = null;

const STORE_LIST = ["matchAlliances", "teams", "eventDetails", "teamStatuses", "OPR", "alliances", "EPA", "elimsStarted", "matchScores"];

// ─── OPEN / INIT ─────────────────────────────────────────────────────────────

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = request.result;

            // Drop any old stores if upgrading
            for (const name of [...db.objectStoreNames]) {
                db.deleteObjectStore(name);
            }

            db.createObjectStore("scoutingData", { keyPath: "Id" });
            for (const store of STORE_LIST) {
                db.createObjectStore(store, { keyPath: "key" });
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

// Store an array of scouting rows (bulk write)
export async function setScoutingData(rows) {
    console.log('setScoutingData called with', rows.length, 'rows');
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);

        if (rows) {
            for (const row of rows) store.put(row);
        } else if (key !== null && value !== null) {
            store.put({ key, value });
        }
        tx.onerror = () => {
            console.log('transaction error', tx.error);
            reject(tx.error);
        }
        tx.onabort = () => {
            console.log('transaction aborted', tx.error);
        }
    });
}

// Wipe all stored scouting data (call this when switching events)
export async function clearScoutingData() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ─── READ ────────────────────────────────────────────────────────────────────

// Get all scouting rows
export async function getScoutingData() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get the highest Id stored (used for incremental fetching)
export async function getLastId(data) {
    if (!data.length) return 0;
    return Math.max(...data.map(r => r.Id));
}