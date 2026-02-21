import { Iplayer } from '../interfaces';
import { find_state_data } from '../util';
import api from '../api';
import village from './village';

class player {
	ident: string = 'Player:';

	async get(): Promise<Iplayer> {
		const villages_data: any = await village.get_own();
		const villages: any = find_state_data(village.collection_own_ident, villages_data);
		const player_id: string = villages[0]?.data?.playerId;

		const response = await api.get_cache([this.ident + player_id]);
		const player_data: Iplayer = find_state_data(this.ident + player_id, response);

		return player_data;
	}
}

export default new player();
