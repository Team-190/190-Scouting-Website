<script>
  import { removeToast, toasts } from "../stores/toasts";
</script>

<div class="toast-stack" aria-live="polite" aria-atomic="false">
  {#each $toasts as toast (toast.id)}
    <button
      type="button"
      class="toast toast-{toast.type}"
      onclick={() => removeToast(toast.id)}
    >
      <span
        class="toast-progress"
        style={`animation-duration: ${toast.duration}ms;`}
      ></span>
      <span class="toast-message">{toast.message}</span>
    </button>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    right: 1rem;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    width: min(24rem, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    z-index: 10020;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    border: none;
    border-radius: 0.55rem;
    padding: 0.9rem 0.95rem 0.8rem;
    color: #fff;
    text-align: left;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    overflow: hidden;
    position: relative;
    font-weight: 700;
    font-size: 0.9rem;
    line-height: 1.35;
    background: #2f7d32;
  }

  .toast-success {
    background: #2f7d32;
  }

  .toast-error {
    background: #b71c1c;
  }

  .toast-progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 0.18rem;
    width: 100%;
    background: rgba(255, 255, 255, 0.95);
    transform-origin: left center;
    animation-name: shrink;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  .toast-message {
    display: block;
    word-break: break-word;
  }

  @keyframes shrink {
    from {
      transform: scaleX(1);
      opacity: 1;
    }
    to {
      transform: scaleX(0);
      opacity: 0.5;
    }
  }

  @media (max-width: 640px) {
    .toast-stack {
      right: 0.75rem;
      bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
      width: min(22rem, calc(100vw - 1.5rem));
      gap: 0.5rem;
    }

    .toast {
      font-size: 0.84rem;
      padding: 0.8rem 0.85rem 0.7rem;
    }
  }
</style>
