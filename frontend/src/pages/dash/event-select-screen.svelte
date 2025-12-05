<script>
    import {goto} from "@mateothegreat/svelte5-router";
    import { onMount } from "svelte";
    import api from "../../utils/api";

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
    let selectedEvent = "";
  
    const TBA_KEY = "zhTqFG7csJoif1sNXt3aZngy0LB1X4LxMgTfXBvPscNG0P9FifZCa2uGJcUk2gKW";
  
    let allEvents = [];
    let events = [];
  
    // this is a function to get the user's current year
    onMount(async () => {
      const currentYear = new Date().getFullYear();
      years = Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i);
  
      await loadEventsForYear();
      filterEvents();
    });
  
    // this function gets all the events from the TBA API for the current year
    async function loadEventsForYear() {
      try {
        const res = await fetch(
          `https://www.thebluealliance.com/api/v3/events/${selectedYear}`,
          {
            headers: { "X-TBA-Auth-Key": TBA_KEY }
          }
        );
  
        if (!res.ok) {
          console.error("API error:", res.status);
          allEvents = [];
          return;
        }
  
        allEvents = await res.json();
      } catch (err) {
        console.error("Fetch failed:", err);
        allEvents = [];
      }
    }
  
    // this function sorts the events that were collected in the previous step by date
    function filterEvents() {
      events = allEvents.filter(evt => {
        const [year, month, day] = evt.start_date.split("-").map(Number);
        return month === selectedMonth;
      });
    }

    async function handleSubmit() {
        if (!selectedEvent) {
            alert("Please select an event before submitting.");
            return;
        }
    
        await api.postEventCode(selectedEvent);
        alert(`Submitted: ${selectedEvent}`);
        goto("/teamView");
    }

  
    // this adjusts the dropdown based on the year input
    $: if (selectedYear) {
      loadEventsForYear().then(filterEvents);
    }
  
    // this adjusts the dropdown based on the month input
    $: if (selectedMonth) {
      filterEvents();
    }
  </script>
  
  <style>
    /* this is so that the width of the dropdown button always stays the same */
    .select {
      width: 220px;
      min-width: 220px;
      max-width: 220px;
  
      padding: 0.4rem;
      margin-right: 1rem;
      margin-top: 0.5rem;
  
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  
    h2 {
      margin-top: 20px;
      margin-bottom: 10px;
    }

    .submit-button {
    display: block;
    margin: 20px auto 0 auto;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    cursor: pointer;
    background-color: #23a0ed;
    }
  </style>
  
  <h2>Event Selector</h2>
  
  <!-- YEAR -->
  <select class="select" bind:value={selectedYear}>
    {#each years as y}
      <option value={y}>{y}</option>
    {/each}
  </select>
  
  <!-- MONTH -->
  <select class="select" bind:value={selectedMonth}>
    {#each months as m}
      <option value={m.value}>{m.label}</option>
    {/each}
  </select>
  
  <!-- EVENT -->
  <select class="select" bind:value={selectedEvent}>
    <option value="">Select an event...</option>
  
    {#each events as event}
      <option value={event.key}>
        {event.name} — {event.start_date}
      </option>
    {/each}
  </select>  
  
  {#if selectedEvent}
    <p>You selected: {selectedEvent}</p>
  {/if}

  <button class="submit-button" on:click={handleSubmit}>Submit</button>