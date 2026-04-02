<script>
    import { onMount, tick } from "svelte";
    import { fetchAllData, fetchEventDetails, fetchEvents, fetchOPR, fetchPitScouting, fetchQualitativeScouting } from "../utils/api";
    import { clearAllStores, getIndexedDBStore, getLastId, setIndexedDBStore } from '../utils/indexedDB';

    let eventCode = localStorage.getItem("eventCode");
    let isLoading = false;
    let notification = null;
    let isAutoSyncing = false;
    let lastAutoSyncedEvent = null;

    function parseStoredJson(key, fallback) {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    async function parseResponseJson(response, fallback = {}) {
        const responseText = await response.text();
        if (!responseText) return fallback;

        try {
            return JSON.parse(responseText);
        } catch {
            return fallback;
        }
    }

    function showNotification(message, type = "success", duration = 3000) {
        notification = { message, type };
        setTimeout(() => {
            notification = null;
        }, duration);
    }

    async function withLoading(task, successMessage, errorMessage) {
        isLoading = true;
        await tick();
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

    async function cacheAllData({ forceFullRefresh = false } = {}) {
        await withLoading(async () => {
            if (!eventCode) {
                throw new Error("No event selected");
            }

            const existingData = forceFullRefresh ? [] : await getIndexedDBStore("scoutingData");
            const lastId = await getLastId(existingData);

            const dataRes = await fetchAllData(eventCode, lastId);
            if (!dataRes.ok) {
                throw new Error(`Failed to fetch scouting data: HTTP ${dataRes.status}`);
            }
            const dataJson = await parseResponseJson(dataRes, {});
            const newData = dataJson.data || [];
            if (newData.length > 0) {
                await setIndexedDBStore("scoutingData", { rows: newData });
            }

            const localPit = forceFullRefresh ? {} : parseStoredJson("retrievePit", {});
            const pitTeams = Object.keys(localPit);

            const pitRes = await fetchPitScouting(eventCode, pitTeams);
            if (!pitRes.ok) {
                throw new Error(`Failed to fetch pit scouting: HTTP ${pitRes.status}`);
            }
            const newPitData = await parseResponseJson(pitRes, {});
            
            const combinedPit = { ...localPit, ...newPitData };
            localStorage.setItem("retrievePit", JSON.stringify(combinedPit));

            const localQual = forceFullRefresh ? {} : parseStoredJson("retrieveQual", {});
            const qualCounts = {};
            for (const team in localQual) {
                qualCounts[team] = Object.keys(localQual[team] || {}).length;
            }

            const qualRes = await fetchQualitativeScouting(eventCode, qualCounts);
            if (!qualRes.ok) {
                throw new Error(`Failed to fetch qualitative scouting: HTTP ${qualRes.status}`);
            }
            const newQualData = await parseResponseJson(qualRes, {});
            
            const combinedQual = { ...localQual };
            for (const team in newQualData) {
                combinedQual[team] = { ...(combinedQual[team] || {}), ...newQualData[team] };
            }
            localStorage.setItem("retrieveQual", JSON.stringify(combinedQual));

            const newOprData = await fetchOPR(eventCode);
            localStorage.setItem("retrieveOPR", JSON.stringify(newOprData || {}));

            localStorage.setItem("timestamp", new Date(Date.now()).toLocaleString());
            localStorage.setItem("eventCode", eventCode);
        }, "Data loaded successfully!", "Failed to load data.");
    }

    async function syncEventData() {
        if (!eventCode || isAutoSyncing) return;

        isAutoSyncing = true;
        try {
            const previousEventCode = localStorage.getItem("eventCode");
            const isNewEvent = previousEventCode !== eventCode;

            if (isNewEvent) {
                await clearAllStores();
                localStorage.removeItem("retrievePit");
                localStorage.removeItem("retrieveQual");
                localStorage.removeItem("retrieveOPR");
            }

            localStorage.setItem("eventCode", eventCode);
            await cacheAllData({ forceFullRefresh: isNewEvent });
            lastAutoSyncedEvent = eventCode;
        } finally {
            isAutoSyncing = false;
        }
    }

    let dbEvents = [];

    async function loadDbEvents() {
        await withLoading(async () => {
            const res = await fetchEvents();
            if (res.ok) {
                const eventsFromDb = await res.json();
                
                // Fetch event details from Blue Alliance for each event code
                // Only fetch for valid TBA event codes (format: YYYY[event-code])
                const eventsWithNames = await Promise.all(
                    eventsFromDb.map(async (event) => {
                        // Check if event code looks like a real TBA event code
                        const isTbaEventCode = /^\d{4}[a-z0-9]+$/.test(event.eventCode);
                        
                        if (isTbaEventCode) {
                            const details = await fetchEventDetails(event.eventCode);
                            return {
                                ...event,
                                name: details.name || event.eventCode,
                            };
                        } else {
                            // Use eventCode as name for non-TBA event codes
                            return {
                                ...event,
                                name: event.name || event.eventCode,
                            };
                        }
                    })
                );
                
                dbEvents = eventsWithNames;
            } else {
                throw new Error("Failed to fetch events");
            }
        }, "Events loaded successfully!", "Failed to load events from backend.");
    }

    onMount(async () => {
        await loadDbEvents();
    });

    // Reactive statement to handle event code changes
    $: if (eventCode && typeof window !== 'undefined' && eventCode !== lastAutoSyncedEvent && !isAutoSyncing) {
        syncEventData();
    }
</script>

{#if notification}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="banner banner-{notification.type}" onclick={() => notification = null}>
        {notification.message}
    </div>
{/if}

{#if isLoading}
    <div class="loading-spinner-overlay">
        <div class="loading-spinner"></div>
    </div>
{/if}

<div class="container">
    <div class="button-container">
        <div
            class="button-wrapper"
            onclick={() => cacheAllData()}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === "Enter" && cacheAllData()}
        >
            <div class="circle">
                <span class="label">Populate Local Storage</span>
            </div>
        </div>
    </div>

    <div class="event-selector-panel">
        <h2>Event Selector</h2>

        <select class="select" bind:value={eventCode}>
            {#each dbEvents as event}
                <option value={event.eventCode}>{event.name}</option>
            {/each}
        </select>

        <p class="selected-event">
            You selected: {dbEvents.find((e) => e.eventCode === eventCode)
                ?.name || eventCode}
        </p>
    </div>
</div>

<style>
    :root {
        --frc-190-red: #c81b00;
        --wpi-gray: #a9b0b7;
        --frc-190-black: #4d4d4d;
    }

    .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 2rem;
        background: var(--wpi-gray);
        font-family: sans-serif;
    }

    .button-wrapper {
        width: 300px;
        height: 300px;
        cursor: pointer;
        transition: transform 0.2s;
        margin-bottom: 2rem;
    }

    .button-wrapper:hover {
        transform: scale(1.05);
    }

    .button-wrapper:active {
        transform: scale(0.95);
    }

    .circle {
        width: 100%;
        height: 100%;
        background-color: var(--frc-190-red);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    .label {
        color: white;
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: 2px;
        text-align: center;
        line-height: 1.2;
    }

    .event-selector-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        max-width: 500px;
    }

    h2 {
        margin: 0;
    }

    .select {
        height: 22px;
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
        border: 8px solid rgba(255, 255, 255, 0.3);
        border-left-color: var(--frc-190-red);
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .banner {
        position: fixed;
        top: 400px;
        left: 50%;
        transform: translateX(-50%);
        padding: 1rem 2rem;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        cursor: pointer;
        transition: top 0.3s ease-in-out;
    }

    .banner-success {
        background-color: #4CAF50; /* Green */
    }

    .banner-error {
        background-color: #f44336; /* Red */
    }

    .button-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        margin-bottom: 2rem;
    }
</style>