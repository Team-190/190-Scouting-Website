<script>
  import { Router } from "@mateothegreat/svelte5-router";
  import { onMount } from "svelte";
  import { isSidebarOpen } from "./stores/sidebarState.js";
  import { pushToast } from "./stores/toasts.js";
  import { startPeriodicQueueSync, syncSelectedEventData } from "./utils/api.js";

  import Navbar from "./components/Navbar.svelte";
  import ToastContainer from "./components/ToastContainer.svelte";
  import Home from "./pages/Home.svelte";
  import DebugPage from "./pages/DebugPage.svelte";
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
    { path: "/debug", component: DebugPage },
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
    let autoSyncInFlight = false;
    let lastAutoSyncedEventCode = null;
    let lastAutoSyncErrorAt = 0;

    const runGlobalAutoSync = async () => {
      if (autoSyncInFlight) return;

      const autoEnabled = (() => {
        try {
          return JSON.parse(localStorage.getItem("homeAutoDataRefreshEnabled") || "false") === true;
        } catch {
          return false;
        }
      })();
      if (!autoEnabled) return;

      const eventCode = localStorage.getItem("eventCode");
      if (!eventCode) return;

      autoSyncInFlight = true;
      try {
        const isNewEvent = lastAutoSyncedEventCode !== eventCode;
        await syncSelectedEventData(eventCode, { forceFullRefresh: isNewEvent });
        lastAutoSyncedEventCode = eventCode;
        pushToast("Data automatically populated.", "success", 3000);
      } catch (error) {
        console.error("Global auto data sync failed:", error);
        const now = Date.now();
        if (now - lastAutoSyncErrorAt > 30000) {
          lastAutoSyncErrorAt = now;
          pushToast("Automatic data population failed.", "error", 4000);
        }
      } finally {
        autoSyncInFlight = false;
      }
    };

    const stopQueueSync = startPeriodicQueueSync(15000);
    const autoSyncTimer = setInterval(runGlobalAutoSync, 60 * 1000);
    const autoSyncNowHandler = () => runGlobalAutoSync();
    window.addEventListener("auto-sync-now", autoSyncNowHandler);
    runGlobalAutoSync();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service_worker.js')
        .then(reg => console.log('SW registered', reg))
        .catch(err => console.error('SW failed', err));
    }

    return () => {
      stopQueueSync();
      clearInterval(autoSyncTimer);
      window.removeEventListener("auto-sync-now", autoSyncNowHandler);
    };
  });
</script>

<!-- Navbar is fixed, so we need padding on main content -->
<Navbar />
<main class="page-content" class:sidebar-collapsed={!$isSidebarOpen}>
  <Router {routes} />
</main>
<ToastContainer />

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
