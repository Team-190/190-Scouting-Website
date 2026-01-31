import { writable } from 'svelte/store';

const stored = localStorage.getItem('selectedEvent');
export const selectedEvent = writable(stored || '');

selectedEvent.subscribe(value => {
    if (value) {
        localStorage.setItem('selectedEvent', value);
    }
});