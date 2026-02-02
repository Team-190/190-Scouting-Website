<script>
    import { Router } from "@mateothegreat/svelte5-router";

    import Navbar from "./components/Navbar.svelte";
    import Home from "./pages/Home.svelte";
    import EventSelectScreen from "./pages/dash/event-select-screen.svelte";
    import PickLists from "./pages/datapages/pickLists.svelte";
    import SingleMetric from "./pages/datapages/singleMetric.svelte";
    import TeamView from "./pages/datapages/teamView.svelte";
    import pitScouting from "./pages/datapages/pitScouting.svelte";
    import gracePage from "./pages/datapages/gracePage.svelte";

    const routes = [
        {path : "/", component: Home},
        {path : "/event-select", component: EventSelectScreen},
        {path : "/pickLists", component: PickLists},
        {path : "/singleMetric", component: SingleMetric},
        {path : "/teamView", component: TeamView},
        {path : "/pitScouting", component: pitScouting},
        {path : "/gracePage", component: gracePage}
    ];
</script>

<main>
    <Navbar />
    <Router {routes} />
</main>

<style>
</style>
