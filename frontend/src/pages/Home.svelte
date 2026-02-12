<script>
    import { goto } from '@mateothegreat/svelte5-router';
    import { onMount } from "svelte";

    let eventCode = localStorage.getItem("eventCode");

    async function cacheAllData() {
        localStorage.clear();
        console.log("Getting all data from storage for event "+eventCode);
        const data = JSON.stringify((await(await fetch("http://localhost:8000/allData?eventCode="+eventCode)).json()).data);
        
        console.log(data)
        localStorage.setItem("data", data);
        localStorage.setItem("timestamp", new Date(Date.now()).toLocaleString());
        localStorage.setItem("eventCode", eventCode);
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
    let showEventSelector = true;

    const TBA_KEY = import.meta.env.VITE_BA_AUTH_KEY;

    let allEvents = [];
    let events = [];
    let dbEvents = [];

    onMount(async () => {
        const currentYear = new Date().getFullYear();
        years = Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i);
        // await loadEventsForYear();
        // filterEvents();
        await loadDbEvents();
    });

    async function loadDbEvents() {
        try {
            const res = await fetch("http://localhost:8000/events");
            if (res.ok) {
                dbEvents = await res.json();
            }
        } catch (e) {
            console.error("Failed to load events from backend", e);
        }
    }

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

        <select class="select" bind:value={eventCode}>
            {#each dbEvents as event}
                <option value={event.eventCode}>{event.name}</option>
            {/each}
        </select>

        <p class="selected-event">
            You selected: {dbEvents.find(e => e.eventCode === eventCode)?.name || eventCode}
        </p>

        </div>
    {/if}
</div>

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