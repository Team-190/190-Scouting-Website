<script>
  import PageHost from "./components/navigation/PageHost.svelte";
  import SaveStatus from "./components/SaveStatus.svelte";
  import { onMount } from "svelte";
  import { isSidebarOpen } from "./stores/sidebarState.js";
  import { pushToast } from "./stores/toasts.js";
  import { startPeriodicQueueSync, syncSelectedEventData } from "./utils/api.js";

  import Navbar from "./components/Navbar.svelte";
  import ToastContainer from "./components/ToastContainer.svelte";
  import { warmPages } from "./utils/pageLoader";

  onMount(() => {
    warmPages();
    window.addEventListener("online", warmPages);
    let autoSyncInFlight = false;
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
        await syncSelectedEventData(eventCode);

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
      window.removeEventListener("online", warmPages);
      clearInterval(autoSyncTimer);
      window.removeEventListener("auto-sync-now", autoSyncNowHandler);
    };
  });
</script>

<!-- Navbar is fixed, so we need padding on main content -->
<Navbar />
<main class="page-content" class:sidebar-collapsed={!$isSidebarOpen}>
  <PageHost />
</main>
<ToastContainer />
<SaveStatus />

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
