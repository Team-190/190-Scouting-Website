import { writable } from "svelte/store";

const toasts = writable([]);
let nextToastId = 1;

export function pushToast(message, type = "success", duration = 3000) {
  const id = nextToastId++;
  const toast = {
    id,
    message: String(message || ""),
    type,
    duration: Math.max(500, Number(duration) || 3000),
  };

  toasts.update((items) => [...items, toast]);
  setTimeout(() => removeToast(id), toast.duration);
  return id;
}

export function removeToast(id) {
  toasts.update((items) => items.filter((toast) => toast.id !== id));
}

export { toasts };
