<script>
    import { goto } from "@mateothegreat/svelte5-router";
    import { onMount } from "svelte";
    import { postEventCode } from "../../utils/api";
    import { selectedEvent } from "../../stores/selectedEvent";

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