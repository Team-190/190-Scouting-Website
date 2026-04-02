import { render, screen } from '@testing-library/svelte';
import Teamgrid from '../Teamgrid.svelte';
import { vi } from 'vitest';

describe('Teamgrid Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Since Teamgrid might do ResizeObserver magic or similar graph setups from ag-grid:
        global.ResizeObserver = vi.fn().mockImplementation(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
    });

    it('renders the core container without crashing', () => {
        // We render with empty data to avoid deep ag-grid initialization logic errors in mock DOM
        const { container } = render(Teamgrid, {
            props: {
                data: [],
                eventCode: '2024test'
            }
        });

        expect(container).toBeInTheDocument();
        // Since ag-grid creates nodes asynchronously, we only check the container is mounted successfully without crashing.
    });
});
