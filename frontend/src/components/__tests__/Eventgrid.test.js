import { render, screen } from '@testing-library/svelte';
import Eventgrid from '../Eventgrid.svelte';
import { vi } from 'vitest';

describe('Eventgrid Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.ResizeObserver = vi.fn().mockImplementation(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
    });

    it('renders the core container without crashing', () => {
        const { container } = render(Eventgrid, {
            props: {
                events: [],
                sortConfig: null,
                onSortRequest: vi.fn()
            }
        });
        
        expect(container).toBeInTheDocument();
        // The component uses native HTML table layout or divs depending on implementation
        // Either way, it shouldn't crash
    });
});
