<script>
  import { decompressData } from "../utils/compression.js";
  import { flushOfflineScoutingQueues, postEventCode } from "../utils/api";
  import {
    clearAllStores,
    getIndexedDBStore,
    getLastId,
    setIndexedDBStore,
    closeDB,
  } from "../utils/indexedDB";

  const DB_NAME = "scoutingDB";
  const STORE_NAMES = [
    "scoutingData",
    "matchAlliances",
    "teams",
    "eventDetails",
    "teamStatuses",
    "OPR",
    "alliances",
    "EPA",
    "elimsStarted",
    "matchScores",
    "retrievePit",
    "retrieveQual",
    "COPR",
    "metricsCache",
  ];

  let loading = false;
  let error = "";
  let eventCode = "";
  let storeSummaries = [];
  let selectedStore = "";
  let selectedRecords = [];
  let isLoading = false;
  let notification = null;
  let db = null;

  function showNotification(message, type = "success", duration = 3000) {
    notification = { message, type };
    setTimeout(() => {
      notification = null;
    }, duration);
  }

  async function withLoading(task, successMessage, errorMessage) {
    isLoading = true;
    try {
      await task();
      showNotification(successMessage);
    } catch (e) {
      showNotification(errorMessage, "error");
      console.error(errorMessage, e);
    } finally {
      isLoading = false;
    }
  }

  function isCompressedValue(value) {
    return Boolean(value && typeof value === "object" && value.__compressed);
  }

  function decompressRecord(record) {
    if (!record || typeof record !== "object") return record;

    const out = Array.isArray(record) ? [...record] : { ...record };
    for (const [key, value] of Object.entries(out)) {
      if (isCompressedValue(value)) {
        out[key] = decompressData(value);
      }
    }
    return out;
  }

  function getCompressedFields(record) {
    if (!record || typeof record !== "object") return [];
    return Object.entries(record)
      .filter(([, value]) => isCompressedValue(value))
      .map(([key]) => key);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function readStoreRecords(db, storeName) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }

      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function formatSummary(storeName, records) {
    const compressedRecordCount = records.filter(
      (record) => getCompressedFields(record).length > 0,
    ).length;
    const compressedFieldCount = records.reduce(
      (sum, record) => sum + getCompressedFields(record).length,
      0,
    );

    return {
      storeName,
      totalRecords: records.length,
      compressedRecordCount,
      compressedFieldCount,
      records,
    };
  }

  function toJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  async function clearData() {
    if (!confirm("Are you sure you want to clear all scouting data? This cannot be undone.")) {
        return;
    }

    try {
        isLoading = true;
        
        // Set a flag to indicate we're clearing (prevents auto-fetch on reload)
        localStorage.setItem("__clearingData", "true");
        
        // Close both open connections
        if (db && typeof db.close === "function") {
            db.close();
            db = null;
        }
        closeDB();

        // Give a small delay to ensure connections are fully closed
        await new Promise(resolve => setTimeout(resolve, 150));

        // Delete ALL IndexedDB databases (most thorough approach)
        try {
            // Try using the modern IndexedDB.databases() API first
            if (indexedDB.databases && typeof indexedDB.databases === "function") {
                try {
                    const dbs = await indexedDB.databases();
                    for (const dbInfo of dbs) {
                        // Retry logic for blocked deletes
                        let retries = 0;
                        const maxRetries = 5;
                        
                        while (retries < maxRetries) {
                            try {
                                await new Promise((resolve, reject) => {
                                    const request = indexedDB.deleteDatabase(dbInfo.name);
                                let resolved = false;
                                
                                // Timeout: if blocked for too long, assume it will complete eventually
                                const timeout = setTimeout(() => {
                                    if (!resolved) {
                                        resolved = true;
                                        console.warn(`Delete for ${dbInfo.name} is blocked but proceeding anyway`);
                                        resolve();
                                    }
                                }, 1000);
                                
                                request.onsuccess = () => {
                                    if (!resolved) {
                                        resolved = true;
                                        clearTimeout(timeout);
                                        console.log(`Deleted IndexedDB: ${dbInfo.name}`);
                                        resolve();
                                    }
                                };
                                
                                request.onerror = () => {
                                    if (!resolved) {
                                        resolved = true;
                                        clearTimeout(timeout);
                                        console.error(`Error deleting ${dbInfo.name}:`, request.error);
                                        reject(request.error);
                                    }
                                };
                                
                                request.onblocked = () => {
                                    console.warn(`Delete blocked for ${dbInfo.name}, will retry...`);
                                };
                            });
                            
                            break; // Success, exit retry loop
                        } catch (err) {
                            retries++;
                            if (retries < maxRetries) {
                                console.log(`Retry ${retries}/${maxRetries} for ${dbInfo.name}`);
                                await new Promise(resolve => setTimeout(resolve, 250));
                            } else {
                                console.error(`Failed to delete ${dbInfo.name} after ${maxRetries} retries`);
                                throw err;
                            }
                        }
                        }
                    }
                } catch (err) {
                    console.warn("Failed to enumerate IndexedDB databases:", err);
                    // Fallback to deleting known database
                    throw err;
                }
            } else {
                // Fallback: delete known database
                let retries = 0;
                const maxRetries = 5;
                
                while (retries < maxRetries) {
                    try {
                        await new Promise((resolve, reject) => {
                            const request = indexedDB.deleteDatabase("scoutingDB");
                            let resolved = false;
                            
                            // Timeout: if blocked for too long, assume it will complete eventually
                            const timeout = setTimeout(() => {
                                if (!resolved) {
                                    resolved = true;
                                    console.warn("Delete for scoutingDB is blocked but proceeding anyway");
                                    resolve();
                                }
                            }, 1000);
                            
                            request.onsuccess = () => {
                                if (!resolved) {
                                    resolved = true;
                                    clearTimeout(timeout);
                                    console.log("IndexedDB (scoutingDB) deleted successfully");
                                    resolve();
                                }
                            };
                            
                            request.onerror = () => {
                                if (!resolved) {
                                    resolved = true;
                                    clearTimeout(timeout);
                                    reject(request.error);
                                }
                            };
                        });
                        break;
                    } catch (err) {
                        retries++;
                        if (retries < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 250));
                        } else {
                            throw err;
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error deleting IndexedDB:", err);
        }

        // localStorage + sessionStorage - do this AFTER IndexedDB deletion
        const eventCode = localStorage.getItem("eventCode");
        localStorage.clear();
        sessionStorage.clear();
        
        // Restore the clearing flag
        localStorage.setItem("__clearingData", "true");
        if (eventCode) localStorage.setItem("__clearedEventCode", eventCode);

        // Cookies
        document.cookie.split(";").forEach((cookie) => {
            const name = cookie.split("=")[0].trim();
            if (name && name !== "__clearingData" && name !== "__clearedEventCode") {
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
            }
        });

        // Service Worker caches
        if ("caches" in window) {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => caches.delete(key)));
                console.log("Caches cleared");
            } catch (err) {
                console.error("Failed to clear caches:", err);
            }
        }

        // Unregister all service workers
        if ("serviceWorker" in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((reg) => reg.unregister()));
                console.log("Service workers unregistered");
            } catch (err) {
                console.error("Failed to unregister service workers:", err);
            }
        }

        // Wait a bit to ensure everything is cleaned up
        await new Promise(resolve => setTimeout(resolve, 300));

        // Hard reload — bypasses browser cache entirely
        // Use query parameter to force fresh request
        const baseUrl = location.href.split('?')[0].split('#')[0];
        location.href = baseUrl + '?nocache=' + Date.now();
    } catch (err) {
        console.error("Error during clearData:", err);
        showNotification(`Error clearing data: ${err.message}`, "error", 5000);
        isLoading = false;
    }
}
  async function uploadAllLocalStorageData() {
    await withLoading(
      async () => {
        const code = localStorage.getItem("eventCode");
        if (!code) throw new Error("No event code found in localStorage");

        const { pit, qual } = await flushOfflineScoutingQueues();

        const totalUploaded = pit.uploaded + qual.uploaded;
        const totalRemaining = pit.remaining + qual.remaining;

        // Nothing was queued at all — not an error
        if (totalUploaded === 0 && totalRemaining === 0) {
          showNotification("Nothing to upload — queue is empty.");
          return;
        }

        if (totalRemaining > 0 && totalUploaded === 0) {
          throw new Error(
            `No connection to server — ${totalRemaining} item(s) still queued`,
          );
        }

        if (totalRemaining > 0) {
          showNotification(
            `Uploaded ${totalUploaded} item(s), ${totalRemaining} still queued (offline?)`,
            "success",
          );
          return;
        }

        showNotification(`Uploaded ${totalUploaded} item(s) successfully!`);
      },
      "Upload complete!",
      "Failed to upload — check server connection",
    );
  }

  async function refreshStores() {
    loading = true;
    error = "";
    storeSummaries = [];
    selectedStore = "";
    selectedRecords = [];

    try {
      eventCode = localStorage.getItem("eventCode") || "";

      // Close any existing connection before opening a new one
      if (db && typeof db.close === "function") {
        db.close();
        db = null;
      }

      db = await openDatabase();

      const summaries = [];
      for (const storeName of STORE_NAMES) {
        const records = await readStoreRecords(db, storeName);
        summaries.push(formatSummary(storeName, records));
      }

      storeSummaries = summaries;
    } catch (err) {
      error = err?.message || "Failed to read IndexedDB debug data.";
    } finally {
      // Close after reading so it's not held open
      if (db && typeof db.close === "function") {
        db.close();
        db = null;
      }
      loading = false;
    }
  }
  function inspectStore(storeName) {
    selectedStore = storeName;
    const summary = storeSummaries.find((item) => item.storeName === storeName);
    const records = summary?.records || [];

    selectedRecords = records.map((rawRecord, index) => {
      const decompressedRecord = decompressRecord(rawRecord);
      return {
        id: `${storeName}-${index}`,
        compressedFields: getCompressedFields(rawRecord),
        rawJson: toJson(rawRecord),
        decompressedJson: toJson(decompressedRecord),
      };
    });
  }

  async function copySelectedDecompressed() {
    if (!selectedRecords.length) return;

    const payload = selectedRecords.map((item) => {
      try {
        return JSON.parse(item.decompressedJson);
      } catch {
        return item.decompressedJson;
      }
    });

    await navigator.clipboard.writeText(toJson(payload));
  }

  // Check if we just cleared data - if so, skip refresh since page will reload
  if (typeof localStorage !== 'undefined' && !localStorage.getItem("__clearingData")) {
    refreshStores();
  } else if (typeof localStorage !== 'undefined') {
    // Remove the flag for next page load
    localStorage.removeItem("__clearingData");
  }
</script>

<div class="debug-page">
  {#if notification}
    <div
      class="banner banner-{notification.type}"
      onclick={() => (notification = null)}
    >
      {notification.message}
    </div>
  {/if}
  {#if isLoading}
    <div class="loading-spinner-overlay">
      <div class="loading-spinner"></div>
    </div>
  {/if}
  <header>
    <h1>Debug Page</h1>
    <p>
      Inspect raw IndexedDB records and their decompressed values for scouter
      troubleshooting.
    </p>
    <p class="event-line">Current event: {eventCode || "None selected"}</p>
    <div class="controls">
      <button onclick={refreshStores} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh IndexedDB"}
      </button>
      <button
        onclick={copySelectedDecompressed}
        disabled={!selectedRecords.length}
      >
        Copy Decompressed JSON
      </button>
      <button
        onclick={() => clearData()}
        disabled={isLoading}
      >
        {isLoading ? "Clearing..." : "Clear Data"}
      </button>
      <button onclick={uploadAllLocalStorageData} disabled={isLoading}>
        {isLoading ? "Uploading..." : "Upload localStorage"}
      </button>
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <section class="summary-grid">
    {#each storeSummaries as summary}
      <button
        class="store-card"
        onclick={() => inspectStore(summary.storeName)}
      >
        <h2>{summary.storeName}</h2>
        <p>Total records: {summary.totalRecords}</p>
        <p>Records with compressed fields: {summary.compressedRecordCount}</p>
        <p>Compressed fields found: {summary.compressedFieldCount}</p>
      </button>
    {/each}
  </section>

  {#if selectedStore}
    <section class="records-panel">
      <h2>{selectedStore} Records</h2>
      {#if selectedRecords.length === 0}
        <p>No records found in this store.</p>
      {:else}
        {#each selectedRecords as record}
          <article class="record-card">
            <h3>{record.id}</h3>
            <p>
              Compressed fields:
              {record.compressedFields.length > 0
                ? record.compressedFields.join(", ")
                : "None"}
            </p>
            <div class="json-columns">
              <div class="json-column">
                <h4>Raw Stored Record</h4>
                <pre>{record.rawJson}</pre>
              </div>
              <div class="json-column">
                <h4>Decompressed Record</h4>
                <pre>{record.decompressedJson}</pre>
              </div>
            </div>
          </article>
        {/each}
      {/if}
    </section>
  {/if}
</div>

<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  .debug-page {
    min-height: 100vh;
    padding: 1.25rem 1.25rem 2rem;
    background: var(--wpi-gray);
    color: #101010;
    font-family: sans-serif;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  header {
    width: min(75rem, 100%);
    margin: 0 auto;
    background: rgba(255, 255, 255, 0.13);
    border-radius: 0.55rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.18);
    padding: 1rem 1rem 1.1rem;
  }

  header h1 {
    margin: 0;
    color: var(--frc-190-black);
    font-size: 1.85rem;
    line-height: 1.2;
  }

  header p {
    margin: 0.45rem 0 0;
    color: #111;
  }

  .event-line {
    font-weight: 700;
    color: #000;
  }

  .controls {
    margin-top: 0.8rem;
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .controls button {
    border: 2px solid var(--frc-190-red);
    border-radius: 0.4rem;
    background: white;
    color: #000;
    padding: 0.55rem 0.8rem;
    cursor: pointer;
    font-weight: 700;
    transition:
      box-shadow 0.2s ease,
      transform 0.15s ease,
      border-color 0.2s ease;
  }

  .controls button:hover:not(:disabled) {
    border-color: #e02200;
    box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.14);
    transform: translateY(-1px);
  }

  .controls button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .error {
    width: min(75rem, 100%);
    margin: 0 auto;
    color: #7d1111;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(125, 17, 17, 0.35);
    border-left: 0.25rem solid #7d1111;
    border-radius: 0.4rem;
    padding: 0.55rem 0.7rem;
  }

  .summary-grid {
    width: min(75rem, 100%);
    margin: 0 auto;
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .store-card {
    text-align: left;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-left: 0.25rem solid var(--frc-190-red);
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
    padding: 0.75rem 0.8rem;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      box-shadow 0.2s ease;
    color: #111;
  }

  .store-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 5px 13px rgba(0, 0, 0, 0.16);
  }

  .store-card h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--frc-190-black);
  }

  .store-card p {
    margin: 0.35rem 0 0;
    font-size: 0.9rem;
    color: #181818;
  }

  .records-panel {
    width: min(75rem, 100%);
    margin: 0 auto;
  }

  .records-panel h2 {
    margin: 0.2rem 0 0.4rem;
    color: var(--frc-190-black);
    font-size: 1.5rem;
  }

  .record-card {
    margin-top: 0.8rem;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-left: 0.25rem solid var(--frc-190-red);
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.84);
    padding: 0.8rem;
    box-shadow: 0 3px 11px rgba(0, 0, 0, 0.13);
  }

  .record-card h3 {
    margin: 0;
    font-size: 1rem;
    color: #111;
  }

  .record-card p {
    margin: 0.4rem 0;
    font-size: 0.9rem;
    color: #161616;
  }

  .json-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.8rem;
  }

  .json-column {
    min-width: 0;
  }

  .json-columns h4 {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    color: var(--frc-190-black);
  }

  pre {
    margin: 0;
    max-height: 22rem;
    overflow: auto;
    background: #121a24;
    color: #dce7f2;
    border-radius: 0.45rem;
    padding: 0.6rem;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    border: 1px solid rgba(200, 27, 0, 0.35);
  }

  .loading-spinner-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  }
  .loading-spinner {
    border: 0.5rem solid rgba(255, 255, 255, 0.3);
    border-left-color: var(--frc-190-red);
    border-radius: 50%;
    width: 3.125rem;
    height: 3.125rem;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .banner {
    position: fixed;
    top: 25rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 1rem 1.5rem;
    border-radius: 0.5rem;
    color: white;
    font-weight: bold;
    z-index: 10000;
    cursor: pointer;
    font-size: 0.95rem;
    max-width: 90vw;
  }
  .banner-success {
    background-color: #4caf50;
  }
  .banner-error {
    background-color: #f44336;
  }

  @media (max-width: 768px) {
    .debug-page {
      padding: 0.9rem;
    }

    header {
      padding: 0.85rem;
    }

    header h1 {
      font-size: 1.45rem;
    }

    .store-card,
    .record-card {
      padding: 0.7rem;
    }
  }

  @media (max-width: 900px) {
    .json-columns {
      grid-template-columns: 1fr;
    }
  }
</style>
