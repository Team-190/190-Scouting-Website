<script>
  import { onMount, tick } from 'svelte';
  import { navigation, goto, startNavigation } from '../../utils/navigation';
  import LoadingSection from '../LoadingSection.svelte';
  let pages = [];
  let activeKey = '';
  const scroll = new Map();
  const sections = new Map();
  let commit = 0;
  async function show(page) {
    const id = ++commit;
    const key = `${page.event}:${page.path}`;
    if (activeKey === key) return;
    if (activeKey) scroll.set(activeKey, { x: window.scrollX, y: window.scrollY });
    // Keep visited components alive so filters, chart settings, and drafts survive navigation.
    pages = pages.filter(saved => saved.event === page.event);
    if (!pages.some(saved => saved.key === key)) pages = [...pages, { ...page, key }];
    activeKey = key;
    await tick();
    if (id !== commit) return;
    document.body.classList.toggle('home-no-scroll', page.path === '/');
    const position = scroll.get(key) || { x: 0, y: 0 };
    window.scrollTo(position.x, position.y);
    const section = sections.get(key);
    if (section) {
      section.setAttribute('aria-label', section.querySelector('h1')?.textContent || (page.path === '/' ? 'Home' : 'Page content'));
      section.focus({ preventScroll: true });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        section.animate?.([{ opacity: 0.65 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
      }
    }
    window.dispatchEvent(new CustomEvent('page-visible', { detail: { path: page.path } }));
  }
  function remember(node, key) { sections.set(key, node); return { destroy: () => sections.delete(key) }; }
  $: if ($navigation.page) show($navigation.page);
  onMount(startNavigation);
</script>

{#if $navigation.loading}
  <div class="navigation-progress" role="status" aria-live="polite">Opening page...</div>
{/if}
{#if $navigation.error}
  <div class="navigation-error" role="alert">
    <span>{$navigation.error}</span>
    <button onclick={() => goto($navigation.target)}>Retry</button>
    {#if !$navigation.page}<button onclick={() => goto('/')}>Go to Home</button>{/if}
  </div>
{/if}
{#if !pages.length && !$navigation.error}<LoadingSection label="Opening page" />{/if}
{#each pages as page (page.key)}
  <section use:remember={page.key} hidden={activeKey !== page.key} inert={activeKey !== page.key}
    class="route-page" tabindex="-1" aria-label="Page content">
    <svelte:component this={page.component} />
  </section>
{/each}

<style>
  .route-page[hidden] { display: none !important; }
  .route-page:focus { outline: none; }
  .navigation-progress { position: fixed; z-index: 10001; top: 0; left: 0; right: 0;
    padding: .3rem 1rem; background: #8f170d; color: white; font-size: .85rem; pointer-events: none; }
  .navigation-error { position: sticky; top: 0; z-index: 10000; padding: .75rem;
    display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; background: #fff0e9; color: #641b0e; }
</style>
