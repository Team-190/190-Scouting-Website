<script>
    import { onMount, tick } from "svelte";
    import {
        fetchAllData,
        fetchEventDetails,
        fetchEvents,
        fetchMatchAlliances,
        fetchPitScouting,
        fetchQualitativeScouting,
        postEventCode,
        refreshEventCaches,
        readPitScoutingFromIDB,
        writePitScoutingToIDB,
        readQualScoutingFromIDB,
        writeQualScoutingToIDB,
    } from "../utils/api";
    import { clearAllStores, getIndexedDBStore, getLastId, setIndexedDBStore } from '../utils/indexedDB';

    let eventCode = localStorage.getItem("eventCode");
    let isLoading = false;
    let notification = null;
    let isAutoSyncing = false;
    let scheduleLoading = false;
    let autoDataRefreshEnabled = Boolean(parseStoredJson("homeAutoDataRefreshEnabled", false));
    let autoDataRefreshTimer = null;

    const OUR_TEAM_KEY = "frc190";
    let matchSchedule = {
        currentMatch: "—",
        ourMatch: "—",
        matchesUntilOurs: "—",
        minutesUntilOurMatch: "—",
        status: "Select an event and load data to view match timing.",
    };

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

    function getScheduledTimestamp(match) {
        return Number(
            match?.predicted_time || match?.time || match?.actual_time || match?.post_result_time || 0,
        );
    }

    function isMatchComplete(match) {
        const redScore = Number(match?.alliances?.red?.score);
        const blueScore = Number(match?.alliances?.blue?.score);
        const hasFinalScore = Number.isFinite(redScore)
            && Number.isFinite(blueScore)
            && redScore >= 0
            && blueScore >= 0;

        return Boolean(match?.actual_time || match?.post_result_time || hasFinalScore);
    }

    function isOurMatch(match) {
        const redTeams = match?.alliances?.red?.team_keys || [];
        const blueTeams = match?.alliances?.blue?.team_keys || [];
        return [...redTeams, ...blueTeams].includes(OUR_TEAM_KEY);
    }

    function minutesUntil(timestampSec) {
        if (!timestampSec) return "TBD";
        const diff = Math.ceil((timestampSec * 1000 - Date.now()) / 60000);
        return diff <= 0 ? "0" : String(diff);
    }

    async function refreshMatchSchedule() {
        if (!eventCode) {
            matchSchedule = {
                currentMatch: "—",
                ourMatch: "—",
                matchesUntilOurs: "—",
                minutesUntilOurMatch: "—",
                status: "No event selected.",
            };
            return;
        }

        scheduleLoading = true;
        try {
            const [allMatches, details] = await Promise.all([
                fetchMatchAlliances(eventCode),
                fetchEventDetails(eventCode),
            ]);

            const qualMatches = (Array.isArray(allMatches) ? allMatches : [])
                .filter((match) => match?.comp_level === "qm")
                .sort((a, b) => Number(a?.match_number) - Number(b?.match_number));

            if (qualMatches.length === 0) {
                matchSchedule = {
                    currentMatch: "—",
                    ourMatch: "—",
                    matchesUntilOurs: "—",
                    minutesUntilOurMatch: "—",
                    status: `No qualification matches cached for ${details?.name || eventCode}.`,
                };
                return;
            }

            const currentMatch = qualMatches.find((m) => !isMatchComplete(m)) || qualMatches[qualMatches.length - 1];
            const ourNextMatch = qualMatches.find((m) => !isMatchComplete(m) && isOurMatch(m))
                || qualMatches.find((m) => isOurMatch(m));

            const currentNumber = Number(currentMatch?.match_number);
            const ourNumber = Number(ourNextMatch?.match_number);
            const matchesUntil = Number.isFinite(currentNumber) && Number.isFinite(ourNumber)
                ? String(Math.max(0, ourNumber - currentNumber))
                : "—";

            matchSchedule = {
                currentMatch: Number.isFinite(currentNumber) ? String(currentNumber) : "—",
                ourMatch: Number.isFinite(ourNumber) ? String(ourNumber) : "—",
                matchesUntilOurs: matchesUntil,
                minutesUntilOurMatch: ourNextMatch ? minutesUntil(getScheduledTimestamp(ourNextMatch)) : "—",
                status: ourNextMatch
                    ? `Using ${details?.name || eventCode} schedule from TBA cache. (Made by Atharv)`
                    : "Team 190 is not in this event schedule.",
            };
        } catch (error) {
            console.error("Failed to refresh match schedule:", error);
            matchSchedule = {
                currentMatch: "—",
                ourMatch: "—",
                matchesUntilOurs: "—",
                minutesUntilOurMatch: "—",
                status: "Unable to read schedule cache. Click Get Data to refresh from TBA.",
            };
        } finally {
            scheduleLoading = false;
        }
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

    function configureAutoDataRefresh() {
        if (autoDataRefreshTimer) {
            clearInterval(autoDataRefreshTimer);
            autoDataRefreshTimer = null;
        }

        localStorage.setItem("homeAutoDataRefreshEnabled", JSON.stringify(autoDataRefreshEnabled));

        if (!autoDataRefreshEnabled) return;

        syncEventData();
        autoDataRefreshTimer = setInterval(() => {
            syncEventData();
        }, 1000 * 60);
    }

    function handleAutoRefreshToggle(event) {
        autoDataRefreshEnabled = Boolean(event?.target?.checked);
        configureAutoDataRefresh();
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

            const localPit = forceFullRefresh ? {} : await readPitScoutingFromIDB({});
            const pitTeams = Object.keys(localPit);

            const pitRes = await fetchPitScouting(eventCode, pitTeams);
            if (!pitRes.ok) {
                throw new Error(`Failed to fetch pit scouting: HTTP ${pitRes.status}`);
            }
            const newPitData = await parseResponseJson(pitRes, {});
            
            const combinedPit = { ...localPit, ...newPitData };
            await writePitScoutingToIDB(combinedPit);

            const localQual = forceFullRefresh ? {} : await readQualScoutingFromIDB({});
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
            await writeQualScoutingToIDB(combinedQual);

            await refreshEventCaches(eventCode);

            await refreshMatchSchedule();

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
            }

            localStorage.setItem("eventCode", eventCode);
            await postEventCode(eventCode);
            await cacheAllData({ forceFullRefresh: isNewEvent });
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
                
                // Save event code -> name mapping to localStorage for offline reference
                const eventMapping = {};
                eventsFromDb.forEach(event => {
                    eventMapping[event.eventCode] = event.name;
                });
                localStorage.setItem("eventCodeToName", JSON.stringify(eventMapping));
                
                dbEvents = eventsFromDb;
            } else {
                throw new Error("Failed to fetch events");
            }
        }, "Events loaded successfully!", "Failed to load events from backend.");
    }

    onMount(() => {
        (async () => {
            await loadDbEvents();
            await refreshMatchSchedule();
        })();

        configureAutoDataRefresh();

        const scheduleTimer = setInterval(() => {
            refreshMatchSchedule();
        }, 1000 * 60);

        return () => {
            clearInterval(scheduleTimer);
            if (autoDataRefreshTimer) {
                clearInterval(autoDataRefreshTimer);
                autoDataRefreshTimer = null;
            }
        };
    });
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
            onclick={syncEventData}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === "Enter" && syncEventData()}
        >
            <div class="circle">
                <span class="label">Get Data</span>
            </div>
        </div>
    </div>

    <div class="event-selector-panel">
        <h2>Event Selector</h2>

        <select class="select" bind:value={eventCode} onchange={refreshMatchSchedule}>
            {#each dbEvents as event}
                <option value={event.eventCode}>{event.name}</option>
            {/each}
        </select>

        <p class="selected-event">
            You selected: {dbEvents.find((e) => e.eventCode === eventCode)
                ?.name || eventCode}
        </p>

        <label class="auto-refresh-toggle">
            <input
                type="checkbox"
                checked={autoDataRefreshEnabled}
                onchange={handleAutoRefreshToggle}
            />
            <span>Auto Get Data every minute</span>
        </label>

        <div class="match-schedule-panel">
            <h3>Match Schedule</h3>
            {#if scheduleLoading}
                <p class="schedule-status">Loading match timing…</p>
            {:else}
                <p><strong>Current match:</strong> Q{matchSchedule.currentMatch}</p>
                <p><strong>Team 190 next match:</strong> Q{matchSchedule.ourMatch}</p>
                <p><strong>Matches until ours:</strong> {matchSchedule.matchesUntilOurs}</p>
                <p><strong>Minutes until ours:</strong> {matchSchedule.minutesUntilOurMatch}</p>
                <p class="schedule-status">{matchSchedule.status}</p>
            {/if}
        </div>
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
        color: #000000;
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
        color: #000000;
        font-weight: 500;
    }

    .auto-refresh-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.35rem;
        font-size: 0.9rem;
        color: #111;
        font-weight: 600;
        user-select: none;
    }

    .auto-refresh-toggle input {
        width: 1rem;
        height: 1rem;
        accent-color: var(--frc-190-red);
    }

    .match-schedule-panel {
        margin-top: 0.5rem;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 0.5rem;
        padding: 0.9rem 1rem;
        border-left: 0.25rem solid var(--frc-190-red);
    }

    .match-schedule-panel h3 {
        margin: 0 0 0.5rem 0;
        color: var(--frc-190-black);
        font-size: 1.05rem;
    }

    .match-schedule-panel p {
        margin: 0.2rem 0;
        color: #101010;
        font-size: 0.92rem;
    }

    .schedule-status {
        margin-top: 0.5rem !important;
        font-size: 0.82rem !important;
        color: #333 !important;
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