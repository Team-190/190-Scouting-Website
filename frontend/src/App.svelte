<script>
    import { Router } from "@mateothegreat/svelte5-router";

    import Navbar from "./components/Navbar.svelte";
    import Home from "./pages/Home.svelte";
    import PickLists from "./pages/datapages/pickLists.svelte";
    import SingleMetric from "./pages/datapages/singleMetric.svelte";
    import TeamView from "./pages/datapages/teamView.svelte";
    import PitScouting from "./pages/datapages/pitScouting.svelte";
    import GracePage from "./pages/datapages/gracePage.svelte";
    import MarchMadness from "./pages/datapages/marchMadness.svelte";
    import MatchPreview from "./pages/datapages/matchPreview.svelte";

    const routes = [
        { path: "/", component: Home },
        { path: "/pickLists", component: PickLists },
        { path: "/singleMetric", component: SingleMetric },
        { path: "/teamView", component: TeamView },
        { path: "/pitScouting", component: PitScouting },
        { path: "/gracePage", component: GracePage },
        { path: "/marchMadness", component: MarchMadness },
        { path: "/matchPreview", component: MatchPreview }
    ];
</script>

<!-- Navbar is fixed, so we need padding on main content -->
<Navbar />
<main class="page-content">
    <Router {routes} />
</main>

<style>
    /* Ensure navbar doesn’t cover content */
    .page-content {
        padding-top: 20px; /* same as Navbar height */
    }

    main {
        max-width: 1200px;
        margin: 0 auto;
    }
</style>
