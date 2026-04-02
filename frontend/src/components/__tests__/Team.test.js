import { render, screen } from '@testing-library/svelte';
import Team from '../Team.svelte';

describe('Team Component', () => {
    it('renders the team number and name with the default image mapping', () => {
        render(Team, {
            props: {
                team: {
                    team_number: 190,
                    nickname: 'Gompei'
                }
            }
        });

        // The component renders the team number and nickname concatenated
        expect(screen.getByText(/190/)).toBeInTheDocument();
        expect(screen.getByText(/Gompei/)).toBeInTheDocument();
    });

    it('renders correctly with generic team stats', () => {
        render(Team, {
            props: {
                team: {
                    team_number: 254,
                    nickname: 'The Cheesy Poofs'
                }
            }
        });

        expect(screen.getByText(/254/)).toBeInTheDocument();
        expect(screen.getByText(/The Cheesy Poofs/)).toBeInTheDocument();
    });
});
