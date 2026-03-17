<script>
    export let team;
    export let picked = false;
    export let onclick = undefined;
    export let ondragstart = undefined;
    export let onkeydown = undefined;
</script>

<div
    class="list-item"
    data-team-number={team.team_number}
    class:picked
    draggable="true"
    role="button"
    tabindex="0"
    {onclick}
    {ondragstart}
    {onkeydown}
>
    {team.team_number} - {team.nickname}
</div>

<style>
    .list-item {
        padding: 8px;
        margin-bottom: 5px;
        background-color: #fff;
        border: 1px solid #ddd;
        cursor: grab;
        color: #333; /* Added text color */
    }
    .picked {
        background-color: lightcoral;
    }
</style>
