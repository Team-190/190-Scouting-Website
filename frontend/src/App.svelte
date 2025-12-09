<script>
    import { Router } from "@mateothegreat/svelte5-router"
    import { goto } from '@mateothegreat/svelte5-router'

    import EventSelectScreen from "./pages/dash/event-select-screen.svelte";
    import PickLists from "./pages/datapages/pickLists.svelte";
    import SingleMetric from "./pages/datapages/singleMetric.svelte";
    import TeamView from "./pages/datapages/teamView.svelte";

    const routes = [
        {path : "/", component: EventSelectScreen},
        {path : "/pickLists", component: PickLists},
        {path : "/eventView", component: SingleMetric},
        {path : "/teamView", component: TeamView},
    ];
</script>

<main>
    <Router {routes} />
</main>

<style>
</style>
