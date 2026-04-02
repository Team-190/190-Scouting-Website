<script>
    import { onMount, tick } from "svelte";
    import { fetchAllData, fetchEventDetails, fetchEvents, fetchOPR, fetchPitScouting, fetchQualitativeScouting, postPitScouting, postQualitativeScouting } from "../utils/api";
    import { clearAllStores, getIndexedDBStore, getLastId, setIndexedDBStore } from '../utils/indexedDB';

    let eventCode = localStorage.getItem("eventCode");
    let isLoading = false;
    let notification = null;

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

    async function cacheAllData() {
        await withLoading(async () => {
            await clearAllStores();
        
            const dataRes = await fetchAllData(eventCode, 0); 
            const dataText = await dataRes.text();
            const dataJson = dataText ? JSON.parse(dataText) : {};
            const newData = dataJson.data || [];
            await setIndexedDBStore("scoutingData", { rows: newData });

            const localPitStr = localStorage.getItem("retrievePit");
            const localPit = localPitStr ? JSON.parse(localPitStr) : {};
            const pitTeams = Object.keys(localPit);

            const pitRes = await fetchPitScouting(eventCode, pitTeams);
            const pitText = await pitRes.text();
            const newPitData = pitText ? JSON.parse(pitText) : {};
            
            const combinedPit = { ...localPit, ...newPitData };
            localStorage.setItem("retrievePit", JSON.stringify(combinedPit));

            // Save pit scouting data to backend
            for (const [teamNum, pitData] of Object.entries(combinedPit)) {
                try {
                    await postPitScouting(eventCode, teamNum, pitData);
                } catch (e) {
                    console.warn(`Failed to save pit data for team ${teamNum}:`, e);
                }
            }

            const localQualStr = localStorage.getItem("retrieveQual");
            const localQual = localQualStr ? JSON.parse(localQualStr) : {};
            const qualCounts = {};
            for (let team in localQual) {
                qualCounts[team] = Object.keys(localQual[team]).length;
            }

            const qualRes = await fetchQualitativeScouting(eventCode, qualCounts);
            const qualText = await qualRes.text();
            const newQualData = qualText ? JSON.parse(qualText) : {};
            
            const combinedQual = { ...localQual };
            for (let team in newQualData) {
                combinedQual[team] = { ...(combinedQual[team] || {}), ...newQualData[team] };
            }
            localStorage.setItem("retrieveQual", JSON.stringify(combinedQual));

            // Save qualitative scouting data to backend
            for (const [teamNum, matchData] of Object.entries(combinedQual)) {
                for (const [matchNum, qualData] of Object.entries(matchData)) {
                    try {
                        await postQualitativeScouting(eventCode, teamNum, matchNum, qualData);
                    } catch (e) {
                        console.warn(`Failed to save qual data for team ${teamNum} match ${matchNum}:`, e);
                    }
                }
            }

            // Fetch and cache OPR data
            const localOprStr = localStorage.getItem("retrieveOPR");
            const localOpr = localOprStr ? JSON.parse(localOprStr) : {};

            const newOprData = await fetchOPR(eventCode);
            
            const combinedOpr = { ...localOpr, ...newOprData };
            localStorage.setItem("retrieveOPR", JSON.stringify(combinedOpr));

            localStorage.setItem("timestamp", new Date(Date.now()).toLocaleString());
            localStorage.setItem("eventCode", eventCode);
        }, "Data loaded successfully!", "Failed to load data.");
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
    $: if (eventCode && typeof window !== 'undefined') {
        const previousEventCode = localStorage.getItem("eventCode");
        if (previousEventCode && previousEventCode !== eventCode) {
            clearAllStores();
            localStorage.removeItem("retrievePit");
            localStorage.removeItem("retrieveQual");
            localStorage.removeItem("retrieveOPR");
        }
        localStorage.setItem("eventCode", eventCode);
        cacheAllData();
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
            onclick={cacheAllData}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === "Enter" && cacheAllData()}
        >
            <div class="circle">
                <span class="label">Get Data</span>
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
        padding: 1.25rem;
        background: var(--wpi-gray);
        font-family: sans-serif;
        gap: 2rem;
    }

    .button-wrapper {
        width: 18.75rem;
        height: 18.75rem;
        cursor: pointer;
        transition: transform 0.2s;
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
        box-shadow: 0 0.625rem 1.875rem rgba(0, 0, 0, 0.5);
        padding: 1rem;
    }

    .label {
        color: white;
        font-size: 1.2rem;
        font-weight: 800;
        letter-spacing: 0.125rem;
        text-align: center;
        line-height: 1.3;
    }

    .event-selector-panel {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: 100%;
        max-width: 31.25rem;
        background: rgba(255, 255, 255, 0.1);
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.3rem;
        color: var(--frc-190-black);
    }

    .select {
        padding: 0.5rem 0.75rem;
        font-size: 1rem;
        border: 0.125rem solid var(--frc-190-red);
        border-radius: 0.25rem;
        background: #fff;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .select:hover {
        border-color: #e02200;
        box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.1);
    }

    .select:focus {
        outline: none;
        border-color: var(--frc-190-red);
        box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.2);
    }

    .selected-event {
        margin: 0.5rem 0 0 0;
        font-size: 0.9rem;
        color: var(--frc-190-black);
        font-weight: 500;
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
        transition: top 0.3s ease-in-out;
        font-size: 0.95rem;
        max-width: 90vw;
    }

    .banner-success {
        background-color: #4CAF50;
    }

    .banner-error {
        background-color: #f44336;
    }

    .button-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }

    /* Tablet Breakpoint (768px) */
    @media (max-width: 768px) {
        .container {
            padding: 1rem;
            gap: 1.5rem;
        }

        .button-wrapper {
            width: 15rem;
            height: 15rem;
        }

        .label {
            font-size: 1rem;
            letter-spacing: 0.05rem;
        }

        .event-selector-panel {
            padding: 1.25rem;
            gap: 0.6rem;
        }

        h2 {
            font-size: 1.1rem;
            margin-bottom: 0.4rem;
        }

        .select {
            font-size: 0.9rem;
            padding: 0.4rem 0.6rem;
        }

        .selected-event {
            font-size: 0.8rem;
        }
    }

    /* Mobile Breakpoint (480px) */
    @media (max-width: 480px) {
        .container {
            padding: 0.75rem;
            gap: 1.25rem;
            justify-content: flex-start;
            padding-top: 2rem;
        }

        .button-wrapper {
            width: 11.25rem;
            height: 11.25rem;
        }

        .circle {
            padding: 0.75rem;
        }

        .label {
            font-size: 0.85rem;
            letter-spacing: 0.03rem;
            line-height: 1.2;
        }

        .event-selector-panel {
            max-width: 100%;
            padding: 1rem;
            gap: 0.5rem;
        }

        h2 {
            font-size: 0.95rem;
            margin-bottom: 0.3rem;
        }

        .select {
            font-size: 0.85rem;
            padding: 0.35rem 0.5rem;
        }

        .selected-event {
            font-size: 0.75rem;
            margin-top: 0.25rem;
        }

        .banner {
            top: 5rem;
            font-size: 0.85rem;
            padding: 0.75rem 1rem;
        }
    }
</style>