<script>
    import { decompressData } from "../utils/compression.js";

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
        const compressedRecordCount = records.filter((record) => getCompressedFields(record).length > 0).length;
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

    async function refreshStores() {
        loading = true;
        error = "";
        storeSummaries = [];
        selectedStore = "";
        selectedRecords = [];

        try {
            eventCode = localStorage.getItem("eventCode") || "";
            const db = await openDatabase();

            const summaries = [];
            for (const storeName of STORE_NAMES) {
                const records = await readStoreRecords(db, storeName);
                summaries.push(formatSummary(storeName, records));
            }

            storeSummaries = summaries;
            if (db && typeof db.close === "function") {
                db.close();
            }
        } catch (err) {
            error = err?.message || "Failed to read IndexedDB debug data.";
        } finally {
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

    refreshStores();
</script>

<div class="debug-page">
    <header>
        <h1>Debug Page</h1>
        <p>Inspect raw IndexedDB records and their decompressed values for scouter troubleshooting.</p>
        <p class="event-line">Current event: {eventCode || "None selected"}</p>
        <div class="controls">
            <button on:click={refreshStores} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh IndexedDB"}
            </button>
            <button on:click={copySelectedDecompressed} disabled={!selectedRecords.length}>
                Copy Decompressed JSON
            </button>
        </div>
    </header>

    {#if error}
        <p class="error">{error}</p>
    {/if}

    <section class="summary-grid">
        {#each storeSummaries as summary}
            <button class="store-card" on:click={() => inspectStore(summary.storeName)}>
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
    .debug-page {
        min-height: 100vh;
        padding: 1.25rem;
        background: #f2f4f7;
        color: #1f2933;
        font-family: Arial, sans-serif;
    }

    header h1 {
        margin: 0;
    }

    header p {
        margin: 0.4rem 0;
    }

    .event-line {
        font-weight: 700;
    }

    .controls {
        margin-top: 0.9rem;
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
    }

    button {
        border: 1px solid #bdc7d3;
        border-radius: 0.45rem;
        background: white;
        color: #1f2933;
        padding: 0.55rem 0.8rem;
        cursor: pointer;
        font-weight: 600;
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    .error {
        margin-top: 0.9rem;
        color: #8f1d1d;
        font-weight: 700;
    }

    .summary-grid {
        margin-top: 1.1rem;
        display: grid;
        gap: 0.8rem;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .store-card {
        text-align: left;
        border: 1px solid #c7d2df;
        border-radius: 0.6rem;
        background: white;
        box-shadow: 0 2px 9px rgba(0, 0, 0, 0.08);
    }

    .store-card h2 {
        margin: 0;
        font-size: 1rem;
    }

    .store-card p {
        margin: 0.35rem 0 0;
        font-size: 0.9rem;
    }

    .records-panel {
        margin-top: 1.1rem;
    }

    .record-card {
        margin-top: 0.8rem;
        border: 1px solid #d3dae3;
        border-radius: 0.6rem;
        background: white;
        padding: 0.8rem;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.07);
    }

    .record-card h3 {
        margin: 0;
        font-size: 0.95rem;
    }

    .record-card p {
        margin: 0.4rem 0;
        font-size: 0.9rem;
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
    }

    @media (max-width: 900px) {
        .json-columns {
            grid-template-columns: 1fr;
        }
    }
</style>
