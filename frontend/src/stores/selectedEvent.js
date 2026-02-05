import { writable } from 'svelte/store';

const stored = localStorage.getItem('eventCode');
export const eventCode = writable(stored || '');

eventCode.subscribe(value => {
    if (value) {
        localStorage.setItem('eventCode', value);
    }
});