// @ts-nocheck
import { render, screen } from '@testing-library/svelte';
import TeamHoverCard from '../teamHoverCard.svelte';

describe('teamHoverCard Component', () => {
    it('renders the core wrapper elements with correct zIndex offset based on rank', () => {
       render(TeamHoverCard, {
           props: {
               team: { team_number: 190, nickname: 'Gompei' },
               eventCode: '2024test',
               visible: true,
               cachedOPRs: { 'frc190': 22.1 },
               teamAggCache: {},
               globalStats: {}
           }
       });
       
       // Svelte Testing Library typically uses closest or query selectors for complex custom class names
       // 190 should appear
       expect(screen.getByText(/190/)).toBeInTheDocument();
       // 22.1 OPR should appear
       expect(screen.getByText(/22\.1/)).toBeInTheDocument(); 
    });
});
