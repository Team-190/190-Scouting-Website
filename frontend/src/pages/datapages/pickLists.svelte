<script>
    import Team from '../../components/Team.svelte';

    let events = $state([]);
    let selectedEvent = $state('');
    let teams = $state([]);
    let picklists = $state({});
    let tbaApiKey = $state('zhTqFG7csJoif1sNXt3aZngy0LB1X4LxMgTfXBvPscNG0P9FifZCa2uGJcUk2gKW');

    let draggedItem = $state(null);
    let newPickListName = $state('');
    let pickedTeams = $state({});

    function toggleTeamPicked(teamNumber) {
        pickedTeams[teamNumber] = !pickedTeams[teamNumber];
    }

    function createPickList() {
        if (newPickListName && !picklists[newPickListName]) {
            picklists[newPickListName] = { name: newPickListName, teams: [] };
            newPickListName = '';
        } else if (picklists[newPickListName]) {
            alert('Picklist with that name already exists.');
        }
    }

    function deletePickList(key) {
        const newPicklists = { ...picklists };
        delete newPicklists[key];
        picklists = newPicklists;
    }

    async function getEvents() {
        if (!tbaApiKey) {
            alert('Please enter your TBA API Key');
            return;
        }
        const year = new Date().getFullYear();
        const response = await fetch(`https://www.thebluealliance.com/api/v3/events/${year}/simple`, {
            headers: {
                'X-TBA-Auth-Key': tbaApiKey
            }
        });
        events = await response.json();
    }

    async function getTeams() {
        if (!selectedEvent) return;
        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedEvent}/teams/simple`, {
            headers: {
                'X-TBA-Auth-Key': tbaApiKey
            }
        });
        teams = await response.json();
        // Reset picklists when new teams are fetched
        for (let list in picklists) {
            picklists[list].teams = [];
        }
    }

    function handleDragStart(item, sourceList) {
        draggedItem = { item, sourceList };
    }

    function handleDrop(targetListKey) {
        if (draggedItem) {
            const { item, sourceList } = draggedItem;

            // Reordering within the same list
            if (sourceList === targetListKey) {
                draggedItem = null; // Drag is done
                return; // Do nothing, reordering is handled by dragenter
            }

            // Add to target list, avoiding duplicates
            const target = picklists[targetListKey];
            if (target && !target.teams.some(t => t.team_number === item.team_number)) {
                target.teams.push(item);
            }

            // Remove from source if it's a picklist
            if (sourceList && sourceList !== 'teams') {
                const source = picklists[sourceList];
                if (source) {
                    const index = source.teams.findIndex(t => t.team_number === item.team_number);
                    if (index > -1) {
                        source.teams.splice(index, 1);
                    }
                }
            }
            // Note: we don't remove from the main 'teams' list to allow adding to multiple picklists

            draggedItem = null;
        }
    }

    function handleDragOver(event) {
        event.preventDefault();
    }

    function handleDragEnter(event, listKey) {
        if (!draggedItem) return;
        const { item, sourceList } = draggedItem;

        if (sourceList !== listKey) return; // Only reorder within the same list

        const list = picklists[listKey].teams;
        const draggedIndex = list.findIndex(t => t.team_number === item.team_number);
        
        const targetElement = event.target.closest('.list-item');
        if (!targetElement) return;

        const targetTeamNumber = Number(targetElement.dataset.teamNumber);
        const dropIndex = list.findIndex(t => t.team_number === targetTeamNumber);

        if (draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
            // Basic reorder logic
            const [draggedTeam] = list.splice(draggedIndex, 1);
            list.splice(dropIndex, 0, draggedTeam);
            // This is a simple implementation. For smoother UX, you might want to check
            // if the item is being dragged over the top or bottom half of the target element.
        }
    }


</script>

<main>
    <h1>Picklist</h1>

    <div>
        <label for="tba-key">TBA API Key:</label>
        <input type="text" id="tba-key" bind:value={tbaApiKey}>
        <button on:click={getEvents}>Get Events</button>
    </div>

    {#if events.length > 0}
        <div>
            <label for="event-select">Select Event:</label>
            <select id="event-select" bind:value={selectedEvent} on:change={getTeams}>
                <option value="">--Select an Event--</option>
                {#each events as event}
                    <option value={event.key}>{event.name}</option>
                {/each}
            </select>
        </div>
    {/if}

    <div class="container">
        <div class="team-list">
            <h2>Teams</h2>
            <div class="list" on:dragover={handleDragOver} on:drop={() => { /* Can't drop back on main list */ }}>
                {#each teams as team (team.team_number)}
                    <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, 'teams')} />
                {/each}
            </div>
        </div>

        {#each Object.entries(picklists) as [key, list]}
            <div class="picklist">
                <h2>{list.name} <button on:click={() => deletePickList(key)}>X</button></h2>
                <div class="list" on:dragover={handleDragOver} on:drop={() => handleDrop(key)} on:dragenter={(e) => handleDragEnter(e, key)}>
                    {#each list.teams as team (team.team_number)}
                        <Team {team} picked={!!pickedTeams[team.team_number]} on:click={() => toggleTeamPicked(team.team_number)} on:dragstart={() => handleDragStart(team, key)} />
                    {/each}
                </div>
            </div>
        {/each}
    </div>
    <div class="controls">
        <input type="text" bind:value={newPickListName} placeholder="New picklist name" />
        <button on:click={createPickList}>Create Picklist</button>
    </div>

</main>

<style>
    .container {
        display: flex;
        gap: 20px;
    }
    .team-list, .picklist {
        width: 300px;
        border: 1px solid #ccc;
        border-radius: 5px;
        padding: 10px;
    }
    .list {
        min-height: 200px;
        background-color: #f9f9f9;
        padding: 5px;
    }
    .controls {
        margin-top: 20px;
    }
    h2 button {
        font-size: 0.8rem;
        margin-left: 10px;
        cursor: pointer;
    }
</style>