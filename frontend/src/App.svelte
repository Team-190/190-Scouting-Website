<script>
  import { Router } from "@mateothegreat/svelte5-router";
  import { onMount } from "svelte";
  import { isSidebarOpen } from "./stores/sidebarState.js";
  import { startPeriodicQueueSync } from "./utils/api.js";

  import Navbar from "./components/Navbar.svelte";
  import Home from "./pages/Home.svelte";
  import InfoPage from "./pages/Infopage.svelte";
  import AnanthPage from "./pages/datapages/ananthPage.svelte";
  import GracePage from "./pages/datapages/gracePage.svelte";
  import MarchMadness from "./pages/datapages/marchMadness.svelte";
  import MatchPreview from "./pages/datapages/matchPreview.svelte";
  import PickLists from "./pages/datapages/pickLists.svelte";
  import PitScouting from "./pages/datapages/pitScouting.svelte";
  import QualPage from "./pages/datapages/qualPage.svelte";
  import SingleMetric from "./pages/datapages/singleMetric.svelte";
  import TeamView from "./pages/datapages/teamView.svelte";
  import QualDataView from "./pages/datapages/qualDataView.svelte";

  const routes = [
    { path: "/", component: Home },
    { path: "/info", component: InfoPage },
    { path: "/pickLists", component: PickLists },
    { path: "/singleMetric", component: SingleMetric },
    { path: "/teamView", component: TeamView },
    { path: "/pitScouting", component: PitScouting },
    { path: "/gracePage", component: GracePage },
    { path: "/ananthPage", component: AnanthPage },
    { path: "/marchMadness", component: MarchMadness },
    { path: "/matchPreview", component: MatchPreview },
    { path: "/qualPage", component: QualPage },
    { path: "/qualDataView", component: QualDataView },
  ];

  onMount(() => {
    const stopQueueSync = startPeriodicQueueSync(15000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service_worker.js')
        .then(reg => console.log('SW registered', reg))
        .catch(err => console.error('SW failed', err));
    }

    return () => {
      stopQueueSync();
    };
  });
</script>

<!-- Navbar is fixed, so we need padding on main content -->
<Navbar />
<main class="page-content" class:sidebar-collapsed={!$isSidebarOpen}>
  <Router {routes} />
</main>

<style>
  /* Adjust for sidebar navbar */
  .page-content {
    margin-left: 80px;
    padding: 0;
    min-height: 100vh;
    width: calc(100% - 80px);
    transition: margin-left 0.2s ease, width 0.2s ease;
  }

  main {
    max-width: 100%;
  }

  .page-content.sidebar-collapsed {
    margin-left: 80px;
    width: calc(100% - 80px);
  }

  @media (max-width: 768px) {
    .page-content,
    .page-content.sidebar-collapsed {
      margin-left: 0;
      width: 100%;
      padding-top: 3.75rem;
    }
  }
</style>
