// @ts-nocheck
const DB_NAME = 'scoutingDB';
const DB_VERSION = 1;

// ─── OPEN / INIT ────────────────────────────────────────────────────────────

let dbInstance = null;


function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            
            if (!db.objectStoreNames.contains('scoutingData')) {
                db.createObjectStore('scoutingData', { keyPath: 'Id' });
            }
            
            const stores = ["matchAlliances", "teams", "eventDetails", "teamStatuses", "OPR", "alliances", "alliancesAvailable", "EPA", "elimsStarted", "matchScores"];
            for (const store of stores) {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store, { autoIncrement: true });
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

// Store an array of scouting rows (bulk write)
export async function setIndexedDBStore(rows, STORE="scoutingData") {
    console.log('setScoutingData called with', rows.length, 'rows');
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const row of rows) {
            store.put(row);
        }
        tx.oncomplete = () => {
            console.log('transaction complete');
            resolve();
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
export async function clearIndexedDBStore(STORE="scoutingData") {
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
export async function getIndexedDBStore(STORE="scoutingData") {
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