<script>
    import { Router } from "@mateothegreat/svelte5-router";

    import Navbar from "./components/Navbar.svelte";
    import Home from "./pages/Home.svelte";
    import PickLists from "./pages/datapages/pickLists.svelte";
    import SingleMetric from "./pages/datapages/singleMetric.svelte";
    import TeamView from "./pages/datapages/teamView.svelte";
    import graphPage from "./pages/datapages/graphPage.svelte";

    const routes = [
        {path : "/", component: Home},
        {path : "/pickLists", component: PickLists},
        {path : "/eventView", component: SingleMetric},
        {path : "/teamView", component: TeamView},
        {path : "/graph", component: graphPage},
    ];
</script>

<main>
    <Navbar />
    <Router {routes} />
</main>

<style>
</style>
