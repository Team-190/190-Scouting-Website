<script>
  export let label = 'Loading data';
  export let compact = false;
</script>
<div class="loading-section" class:compact role="status" aria-live="polite" aria-busy="true">
  <span>{label}...</span>
  <div class="skeleton" aria-hidden="true"></div>
  {#if !compact}<div class="skeleton short" aria-hidden="true"></div>{/if}
</div>
<style>
  .loading-section { margin: 1rem; padding: 1rem; min-height: 140px; border-radius: .65rem;
    background: #8881; color: inherit; }
  .loading-section.compact { min-height: 70px; }
  .skeleton { height: 2rem; margin-top: .7rem; border-radius: .35rem; background: #8883; }
  .short { width: 65%; }
</style>
