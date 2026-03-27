// @ts-nocheck
const DB_NAME = "scoutingDB";
const DB_VERSION = 1;

let dbInstance = null;

const STORE_LIST = ["matchAlliances", "teams", "eventDetails", "teamStatuses", "OPR", "alliances", "EPA", "elimsStarted", "matchScores"];

// ─── VERSION CHECK ───────────────────────────────────────────────────────────

const dbReady = new Promise((resolve) => {
    const checkRequest = indexedDB.open(DB_NAME);
    checkRequest.onsuccess = () => {
        const db = checkRequest.result;
        const currentVersion = db.version;
        db.close();
        if (currentVersion !== DB_VERSION) {
            console.log(`Version mismatch (found v${currentVersion}, expected v${DB_VERSION}), deleting...`);
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            deleteRequest.onsuccess = () => { dbInstance = null; resolve(); };
            deleteRequest.onerror = () => resolve();
        } else {
            resolve();
        }
    };
    checkRequest.onerror = () => resolve();
});

// ─── OPEN / INIT ────────────────────────────────────────────────────────────

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return dbReady.then(() => new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
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
    }));
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
    if (!data.length) return 0;
    return Math.max(...data.map(r => r.Id));
}