<script>
  import { Router } from "@mateothegreat/svelte5-router";
  import { onMount } from "svelte";
  import { isSidebarOpen } from "./stores/sidebarState.js";
  import { pushToast } from "./stores/toasts.js";
  import { startPeriodicQueueSync, syncSelectedEventData } from "./utils/api.js";
  import { clearAllStores } from "./utils/indexedDB.js";

  const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

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

  let statusEventName = "No event selected";
  let statusLastSync = "Not synced yet";
  let statusVersion = APP_VERSION === "dev" ? "dev" : String(APP_VERSION).slice(0, 19);

  function formatSyncTime(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms <= 0) return "Not synced yet";

    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "Not synced yet";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function updateClientStatus() {
    const eventCode = localStorage.getItem("eventCode") || "";
    const eventMapRaw = localStorage.getItem("eventCodeToName") || "{}";
    let eventMap = {};
    try {
      eventMap = JSON.parse(eventMapRaw) || {};
    } catch {
      eventMap = {};
    }

    statusEventName = eventCode ? (eventMap[eventCode] || eventCode) : "No event selected";
    statusLastSync = formatSyncTime(localStorage.getItem("lastFetchMs"));
  }

  onMount(() => {
    updateClientStatus();

    // Freshness check: if client has a very old last-fetch timestamp, clear all caches
    (async function freshnessCheck() {
      try {
        // Allow manual override to force clearing for debugging
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('forceClear') === '1') {
          console.warn('[Freshness] forceClear triggered - wiping client caches');
          await clearAllStores();
          localStorage.clear();
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
          }
          pushToast('Client caches cleared; reloading to update site', 'info', 5000);
          window.location.reload(true);
          return;
        }

        const resp = await fetch('/api/health');
        if (!resp.ok) return;
        const json = await resp.json();
        const serverTs = Number(json?.timestamp) || Date.now();

        let localMs = null;
        const lastFetchMs = localStorage.getItem('lastFetchMs');
        if (lastFetchMs) localMs = Number(lastFetchMs);
        else {
          const localTs = localStorage.getItem('timestamp');
          if (localTs) {
            const parsed = Date.parse(localTs);
            if (!Number.isNaN(parsed)) localMs = parsed;
          }
        }

        // If we have no record yet, create a baseline. Only clients with an
        // actually old timestamp should be wiped; otherwise new clients can
        // get stuck in a clear/reload loop.
        if (!localMs) {
          localStorage.setItem('lastFetchMs', String(serverTs));
          updateClientStatus();
          return;
        }

        // If the local fetch is older than 30 days, assume this is an old
        // client and clear everything so it gets a fresh site/data.
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if ((serverTs - localMs) > THIRTY_DAYS) {
          console.warn('[Freshness] Stale or missing client cache detected - wiping client caches');
          try {
            await clearAllStores();
          } catch (e) {
            console.warn('[Freshness] clearAllStores failed', e);
          }
          localStorage.clear();
          if ('serviceWorker' in navigator) {
            try {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
            } catch (e) {
              console.warn('[Freshness] service worker unregister failed', e);
            }
          }
          pushToast('Stale client detected: cleared caches and reloading to update site', 'info', 6000);
          // Reload to pick up fresh frontend assets
          window.location.reload();
        }
      } catch (e) {
        console.warn('[Freshness] check failed', e);
      }
    })();

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
    const statusUpdatedHandler = () => updateClientStatus();
    const storageHandler = (event) => {
      if (["eventCode", "eventCodeToName", "lastFetchMs", "timestamp"].includes(event.key)) {
        updateClientStatus();
      }
    };
    const clientRefreshHandler = (event) => {
      const reason = event?.detail?.reason || "Server rejected a queued upload.";
      pushToast(`${reason} Reloading to update the client.`, "error", 6000);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    };
    window.addEventListener("auto-sync-now", autoSyncNowHandler);
    window.addEventListener("client-status-updated", statusUpdatedHandler);
    window.addEventListener("storage", storageHandler);
    window.addEventListener("client-refresh-required", clientRefreshHandler);
    runGlobalAutoSync();

    if ('serviceWorker' in navigator) {
      const swUrl = `/service_worker.js?v=${encodeURIComponent(APP_VERSION)}`;
      navigator.serviceWorker.register(swUrl)
        .then(reg => console.log('SW registered', reg))
        .catch(err => console.error('SW failed', err));
    }

    return () => {
      stopQueueSync();
      clearInterval(autoSyncTimer);
      window.removeEventListener("auto-sync-now", autoSyncNowHandler);
      window.removeEventListener("client-status-updated", statusUpdatedHandler);
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("client-refresh-required", clientRefreshHandler);
    };
  });
</script>

<!-- Navbar is fixed, so we need padding on main content -->
<Navbar />
<main class="page-content" class:sidebar-collapsed={!$isSidebarOpen}>
  <Router {routes} />
</main>
<ToastContainer />

<footer class="site-status">
  <div class="site-status-inner">
    <span>{statusEventName}</span>
    <span class="sep">|</span>
    <span>Synced {statusLastSync}</span>
    <span class="sep">|</span>
    <span>Build {statusVersion}</span>
  </div>
</footer>

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

.site-status {
  position: fixed;
  right: 12px;
  bottom: 8px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  z-index: 1200;
}
.site-status .site-status-inner { display:flex; gap:8px; align-items:center }
.site-status .sep { opacity:0.6 }
</style>
