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
        transition: box-shadow 0.2s ease, transform 0.15s ease, border-color 0.2s ease;
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
        transition: transform 0.18s ease, box-shadow 0.2s ease;
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
