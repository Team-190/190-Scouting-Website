<script>
    import { goto } from '@mateothegreat/svelte5-router';
    import { onMount } from "svelte";
    import { postEventCode } from "../utils/api";
    import { selectedEvent } from "../stores/selectedEvent";

    async function cacheAllData() {
        console.log("Getting all data from storage")
        const data = JSON.stringify((await(await fetch("http://localhost:3000/allData")).json()).data);
        
        console.log(data)
        localStorage.setItem("data", data);
        localStorage.setItem("timestamp", new Date(Date.now()).toLocaleString());
    }

    let years = [];
    let months = [
        { value: 1, label: "January" },
        { value: 2, label: "February" },
        { value: 3, label: "March" },
        { value: 4, label: "April" },
        { value: 5, label: "May" },
        { value: 6, label: "June" },
        { value: 7, label: "July" },
        { value: 8, label: "August" },
        { value: 9, label: "September" },
        { value: 10, label: "October" },
        { value: 11, label: "November" },
        { value: 12, label: "December" }
    ];

    let selectedYear = new Date().getFullYear();
    let selectedMonth = new Date().getMonth() + 1;
    let selected_event = "";
    let showEventSelector = false;

    const TBA_KEY = "zhTqFG7csJoif1sNXt3aZngy0LB1X4LxMgTfXBvPscNG0P9FifZCa2uGJcUk2gKW";

    let allEvents = [];
    let events = [];

    onMount(async () => {
        const currentYear = new Date().getFullYear();
        years = Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i);
        await loadEventsForYear();
        filterEvents();
    });

    async function loadEventsForYear() {
        try {
            const res = await fetch(
                `https://www.thebluealliance.com/api/v3/events/${selectedYear}`,
                { headers: { "X-TBA-Auth-Key": TBA_KEY } }
            );
            allEvents = res.ok ? await res.json() : [];
        } catch {
            allEvents = [];
        }
    }

    function filterEvents() {
        events = allEvents.filter(evt => {
            const [, month] = evt.start_date.split("-").map(Number);
            return month === selectedMonth;
        });
    }

    async function handleSubmit() {
        if (!selected_event) {
            alert("Please select an event before submitting.");
            return;
        }

        selectedEvent.set(selected_event);
        await postEventCode(selected_event);
        goto("/teamView");
    }

    function toggleEventSelector() {
        showEventSelector = !showEventSelector;
    }

    $: selectedYear && loadEventsForYear().then(filterEvents);
    $: selectedMonth && filterEvents();

</script>

<div class="container">
    <div class="button-wrapper" on:click={cacheAllData}>
        <div class="circle">
            <span class="label">Populate Local Storage</span>
        </div>
    </div>

    {#if showEventSelector}
        <div class="event-selector-panel">
            <h2>Event Selector</h2>

            <select class="select" bind:value={selected_event}>
                <option value="">Select an event...</option>
                {#each events as event}
                    <option value={event.key}>
                        {event.name} — {event.start_date}
                    </option>
                {/each}
            </select>

            {#if selected_event}
                <p class="selected-event">You selected: {selected_event}</p>
            {/if}

            <button class="submit-button" on:click={handleSubmit}>Submit</button>
        </div>
    {/if}
</div>

<button class="fab" on:click={toggleEventSelector}>
    Select Event
</button>

<style>
    /* FRC 190 Brand Colors */
    :root {
        --frc-190-red: #C81B00;
        --wpi-gray: #A9B0B7;
        --frc-190-black: #4D4D4D;
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
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
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

    .selected-event {
        
    }

    .submit-button {
        height: 20px;
        width: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: auto;
    }

    .fab {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        background-color: var(--frc-190-black);
        color: white;
        border: 2px solid var(--frc-190-red);
        border-radius: 50px;
        font-size: 1.2rem;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        transition: all 0.2s;
    }

    .fab:hover {
        background-color: #333;
        border-color: #e02200;
        transform: translateY(-2px);
    }
</style>