<script>
    export let team;
    export let picked = false;
    export let onclick = undefined;
    export let ondragstart = undefined;
    export let onkeydown = undefined;
    export let onmouseenter = undefined;
    export let onmouseleave = undefined;
    export let onshowdetails = undefined;
</script>
<div
    class="list-item-container"
    data-team-number={team.team_number}
>
    <div
        class="list-item"
        class:picked
        draggable="true"
        role="button"
        tabindex="0"
        {onclick}
        {ondragstart}
        {onkeydown}
        {onmouseenter}
        {onmouseleave}
    >
        {team.team_number} - {team.nickname}
    </div>
    {#if onshowdetails}
        <button
            class="details-btn"
            onclick={onshowdetails}
            title="View team details"
            aria-label="View details for team {team.team_number}"
        >
            View
        </button>
    {/if}
</div>
<style>
    .list-item-container {
        display: flex;
        gap: 2px;
        align-items: center;
        margin-bottom: 5px;
        width: 100%;
    }

    .list-item {
        flex: 1;
        padding: 8px;
        background-color: #fff;
        border: 1px solid #ddd;
        cursor: grab;
        color: #333;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .list-item.picked {
        background-color: lightcoral;
    }

    .details-btn {
        padding: 4px 8px;
        background: #007bff;
        border: 1px solid #0056b3;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.75rem;
        color: white;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;
        transition: all 0.2s;
    }

    .details-btn:hover {
        background: #0056b3;
        border-color: #003d82;
    }

    .details-btn:active {
        background: #003d82;
    }

    @media (max-width: 768px) {
        .list-item-container {
            gap: 6px;
            margin-bottom: 8px;
        }

        .list-item {
            padding: 10px;
            white-space: normal;
            line-height: 1.3;
        }

        .details-btn {
            padding: 6px 10px;
            font-size: 0.8rem;
        }
    }
</style>