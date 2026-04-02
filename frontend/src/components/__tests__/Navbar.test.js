import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { vi } from 'vitest';
import Navbar from '../Navbar.svelte';
import { goto } from '@mateothegreat/svelte5-router';
import { isSidebarOpen } from '../../stores/sidebarState.js';
import * as api from '../../utils/api.js';

// Mock the router goto
vi.mock('@mateothegreat/svelte5-router', () => ({
    goto: vi.fn()
}));

// Mock API calls
vi.mock('../../utils/api.js', () => ({
    fetchAlliances: vi.fn(),
    fetchElimsHaveStarted: vi.fn()
}));

// We can mock the store if needed, but since it's just a standard writable, we can let it work naturally
// Just be sure to reset it before tests
describe('Navbar Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset local storage mocks
        Storage.prototype.getItem = vi.fn(() => 'testEvent123');

        api.fetchAlliances.mockResolvedValue(false);
        api.fetchElimsHaveStarted.mockResolvedValue(false);

        isSidebarOpen.set(false);
    });

    it('renders closed by default (based on store state)', () => {
        render(Navbar);
        const nav = screen.getByRole('navigation', { hidden: true }).closest('nav');
        expect(nav.classList.contains('collapsed')).toBe(true);
    });

    it('toggles sidebar state on menu button click', async () => {
        render(Navbar);
        const toggleBtn = screen.getByLabelText(/toggle sidebar/i);

        await fireEvent.click(toggleBtn);
        // Checking the class change requires knowing the internal state sync
        let sidebarVal;
        const unsub = isSidebarOpen.subscribe(v => sidebarVal = v);
        expect(sidebarVal).toBe(true);
        unsub();
    });

    it('navigates when clicking core navigation links', async () => {
        // Expand the sidebar to make buttons clickable logically if that mattered, 
        // but JSDOM fireEvent will click it anyway unless pointer-events none blocks dom-testing-library.
        // Let's set it to open just in case:
        isSidebarOpen.set(true);

        render(Navbar);

        const teamViewBtn = screen.getByText('Team View').closest('button');
        await fireEvent.click(teamViewBtn);

        expect(goto).toHaveBeenCalledWith('/teamView');
        // Side bar should close on navigation
        let sidebarVal;
        const unsub = isSidebarOpen.subscribe(v => sidebarVal = v);
        expect(sidebarVal).toBe(false);
        unsub();
    });

    it('fetches alliances and shows Gompei Madness if available', async () => {
        api.fetchAlliances.mockResolvedValue(true);

        render(Navbar);

        // the async fetch should trigger a re-render showing the madness button
        await waitFor(() => {
            expect(screen.getByText('Gompei Madness')).toBeInTheDocument();
        });
    });
});
