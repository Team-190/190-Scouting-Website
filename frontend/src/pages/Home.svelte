<script>
    import { goto } from '@mateothegreat/svelte5-router';
    import { onMount } from "svelte";
    import { postEventCode } from "../../utils/api";
    import { selectedEvent } from "../../stores/selectedEvent";

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

    $: selectedYear && loadEventsForYear().then(filterEvents);
    $: selectedMonth && filterEvents();

</script>

<div class="container">
    <div class="button-wrapper" on:click={cacheAllData}>
        <!-- Nonagon (9-sided) -->
        <div class="nonagon">
            <!-- Hexagon (6-sided) -->
            <div class="hexagon">
                <span class="label">Populate localstorage</span>
            </div>
        </div>
    </div>
</div>

<button class="fab" on:click={() => goto('/event-select')}>
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
        height: 100vh;
        background: var(--wpi-gray);
        font-family: sans-serif;
        overflow: hidden;
    }

    .button-wrapper {
        position: relative;
        width: 300px;
        height: 300px;
        cursor: pointer;
        transition: transform 0.2s;
    }

    .button-wrapper:hover {
        transform: scale(1.05);
    }
    
    .button-wrapper:active {
        transform: scale(0.95);
    }

    .nonagon {
        width: 100%;
        height: 100%;
        background-color: var(--frc-190-red);
        /* 
           Approximated 9-sided polygon (Nonagon).
           Vertices calculated roughly around a circle.
        */
        clip-path: polygon(
            50% 0%, 
            83% 12%, 
            100% 43%, 
            94% 78%, 
            68% 100%, 
            32% 100%, 
            6% 78%, 
            0% 43%, 
            17% 12%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); /* Shadow might get clipped, but structure is here */
    }

    .hexagon {
        width: 60%;
        height: 60%;
        background-color: var(--frc-190-black);
        /* 
           Hexagon clip-path 
           Using drop-shadow filter to create a visible border effect around the clipped shape
        */
        filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
        clip-path: polygon(
            50% 0%, 
            100% 25%, 
            100% 75%, 
            50% 100%, 
            0% 75%, 
            0% 25%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
    }

    .label {
        color: white;
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: 2px;
        text-align: center;
        line-height: 1.2;
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

<h2>Event Selector</h2>

<select class="select" bind:value={selectedYear}>
    {#each years as y}
        <option value={y}>{y}</option>
    {/each}
</select>

<select class="select" bind:value={selectedMonth}>
    {#each months as m}
        <option value={m.value}>{m.label}</option>
    {/each}
</select>

<select class="select" bind:value={selected_event}>
    <option value="">Select an event...</option>
    {#each events as event}
        <option value={event.key}>
            {event.name} — {event.start_date}
        </option>
    {/each}
</select>

{#if selected_event}
    <p>You selected: {selected_event}</p>
{/if}

<button class="submit-button" on:click={handleSubmit}>Submit</button>