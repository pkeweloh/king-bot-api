import settings from '../settings';
import api from '../api';
import cache from '../cache';
import { farming, village } from '../gamedata';
import { tribe } from '../data';
import { find_state_data, get_distance } from '../util';
import { Ifarmfinder, Ifarmlist, Ivillage } from '../interfaces';
import { Iresponse } from '../features/feature';

class inactive_finder {

	async add_inactive_player(farmlist: string, inactive: Ifarmfinder): Promise<Iresponse> {
		const temp_data: any = await farming.get_own();
		const farmlist_data: Ifarmlist = farming.find(farmlist, temp_data);

		if (!farmlist_data) {
			return {
				error: true,
				message: 'could not find given farmlist',
				data: null
			};
		}

		const response: any = await api.toggle_farmlist_entry(inactive.villageId, farmlist_data.listId);
		if (response.errors) {
			return {
				error: true,
				message: response.errors[0]?.message,
				data: null
			};
		}

		return {
			error: false,
			message: 'toggled farmlist',
			data: null
		};
	}

	async get_inactives(
		village_id: number,
		min_player_pop: number,
		max_player_pop: number,
		min_village_pop: number,
		max_village_pop: number,
		inactive_for: number,
		min_distance: number,
		max_distance: number
	): Promise<any> {

		const gameworld = settings.gameworld;

		// default values
		if (!min_player_pop || isNaN(min_player_pop))
			min_player_pop = 0;
		if (!max_player_pop || isNaN(max_player_pop))
			max_player_pop = 500;
		if (!min_village_pop || isNaN(min_village_pop))
			min_village_pop = 0;
		if (!max_village_pop || isNaN(max_village_pop))
			max_village_pop = 200;
		if (!inactive_for || isNaN(inactive_for))
			inactive_for = 5;
		if (!min_distance || isNaN(min_distance))
			min_distance = 0;
		if (!max_distance || isNaN(max_distance))
			max_distance = 100;

		// find village
		const village_data = await village.get_own();
		const found_village: Ivillage = village.find(village_id, village_data);
		if (!found_village) {
			return {
				error: true,
				message: `couldn't find village with id: ${village_id}!`,
				data: null
			};
		}
		const { x, y } = found_village.coordinates;

		// get actual map
		const current_map_data = await api.get_map(gameworld);
		if (current_map_data.errors) {
			return {
				error: true,
				message: current_map_data.errors[0]?.message ?? 'failed to get current map snapshot',
				data: null
			};
		}
		const current_snapshot = this.normalize_map_snapshot(current_map_data);
		const kingdom_tags = this.build_kingdom_tag_map(current_map_data);
		if (!current_snapshot.players.length) {
			return {
				error: true,
				message: 'failed to scan world map',
				data: null
			};
		}

		// get aged map
		var aged_map_date = new Date();
		aged_map_date.setDate(aged_map_date.getDate() - inactive_for);
		const aged_map_data = await api.get_map(gameworld, aged_map_date);
		if (aged_map_data.errors) {
			return {
				error: true,
				message: aged_map_data.errors[0]?.message,
				data: null
			};
		}

		const aged_snapshot = this.normalize_map_snapshot(aged_map_data);

		// get villages already in farmlists
		const farmlists = await farming.get_own();
		const data: any[] = find_state_data(farming.farmlist_ident, farmlists);
		const villages_farmlist: Array<number> = [];
		for (let farm of data) {
			const farm_data: Ifarmlist = farm.data;
			for (let id of farm_data.villageIds) {
				villages_farmlist.push(Number(id));
			}
		}

		// find inactive players
		let inactives: Ifarmfinder[] = [];
		const inactive_players = this.discover_inactive_players(current_snapshot, aged_snapshot);
		for (let player of inactive_players) {
			let player_pop = 0;
			for (let village of player.villages) {
				player_pop += village.population ?? 0;
			}

			if (player_pop > max_player_pop || player_pop < min_player_pop)
				continue; // max player pop is reached or min is reached

			for (let village of player.villages) {
				if (villages_farmlist.indexOf(village.villageId) > -1)
					continue; // village is already in farmlist

				let vil_pop = village.population ?? 0;
				if (vil_pop > max_village_pop || vil_pop < min_village_pop)
					continue; // pop is too high or too low

				let distance = get_distance({ x, y }, { x: village.x, y: village.y });
				if (distance > max_distance || distance < min_distance)
					continue; // distance is too high or too low

				const farm: Ifarmfinder = {
					villageId: village.villageId,
					x: village.x,
					y: village.y,
					population: vil_pop,
					village_name: village.name,
					isMainVillage: village.isMainVillage,
					isCity: village.isCity,
					playerId: player.playerId,
					player_name: player.name,
					tribeId: player.tribeId,
					kingdomId: player.kingdomId,
					kingdom_tag: '-',
					distance: distance
				};
				inactives.push(farm);
			}
		}

		// sort by distance, lowest on top
		inactives.sort((a, b) => a.distance - b.distance);

		// get kingdom tags
		for (let farm of inactives) {
			if (!farm.kingdomId) continue;
			const tag = kingdom_tags.get(farm.kingdomId);
			if (tag)
				farm.kingdom_tag = tag;
		}

		return {
			error: false,
			message: `${inactive_players.length} found / ${inactives.length} displayed`,
			data: inactives
		};
	}

	private discover_players(current: Imap_snapshot, aged: Imap_snapshot): Iplayer_match[] {
		const aged_map = new Map<number, Imap_player_snapshot>();
		for (const player of aged.players) {
			aged_map.set(player.playerId, player);
		}

		const matches: Iplayer_match[] = [];
		for (const player of current.players) {
			const aged_player = aged_map.get(player.playerId);
			if (!aged_player)
				continue;
			matches.push({ recent: player, aged: aged_player });
		}
		return matches;
	}

	private discover_inactive_players(current: Imap_snapshot, aged: Imap_snapshot): Imap_player_snapshot[] {
		const inactive_players: Imap_player_snapshot[] = [];
		const overlapping_players = this.discover_players(current, aged);

		for (const match of overlapping_players) {
			if (match.recent.villages.length !== match.aged.villages.length)
				continue; // village count changed
			if (this.compare_village_populations(match.recent.villages, match.aged.villages))
				continue; // population difference detected

			inactive_players.push(match.recent);
		}

		return inactive_players;
	}

	private compare_village_populations(
		recent_data: Imap_village_snapshot[],
		aged_data: Imap_village_snapshot[]
	): boolean {
		for (const recent_village of recent_data) {
			let found = false;
			for (const aged_village of aged_data) {
				if (aged_village.villageId !== recent_village.villageId)
					continue;
				const recent_pop = recent_village.population ?? 0;
				const aged_pop = aged_village.population ?? 0;
				if (recent_pop > aged_pop)
					return true;
				if (recent_pop < (aged_pop - 30)) // village got cat down more than residence and wall, player might still be active
					return true;
				found = true;
				break; // go on with the next recent village
			}
			if (!found)
				return true; // village not found, player moved via menhir
		}
		return false;
	}

	private normalize_map_snapshot(response: any): Imap_snapshot {
		if (!response || !Array.isArray(response.players))
			return { players: [] };

		const players: Imap_player_snapshot[] = [];
		const player_map = new Map<number, Imap_player_snapshot>();
		for (const player of response.players) {
			const player_id = safe_number(player.playerId);
			if (!player_id)
				continue;
			const villages: Imap_village_snapshot[] = [];
			if (Array.isArray(player.villages)) {
				for (const village of player.villages) {
					const snapshot = this.normalize_api_village(village);
					if (snapshot)
						villages.push(snapshot);
				}
			}
			if (villages.length === 0)
				continue;
			const player_entry: Imap_player_snapshot = {
				playerId: player_id,
				name: player.name ?? null,
				tribeId: normalize_tribe(player.tribeId ?? player.tribe),
				kingdomId: safe_number(player.kingdomId ?? player.kingdom),
				villages
			};
			players.push(player_entry);
			player_map.set(player_id, player_entry);
		}

		this.enrich_player_metadata(player_map);

		return { players };
	}

	private normalize_api_village(village: any): Imap_village_snapshot | null {
		if (!village)
			return null;

		const village_id = safe_number(village.villageId);
		if (!village_id)
			return null;

		const coordinates = village.coordinates;
		const x = coordinates?.x ?? safe_number(village.x);
		const y = coordinates?.y ?? safe_number(village.y);
		if (x === null || y === null)
			return null;

		return {
			villageId: village_id,
			name: village.name ?? null,
			x,
			y,
			population: safe_number(village.population),
			isMainVillage: Boolean(village.isMainVillage),
			isCity: Boolean(village.isCity ?? village.isTown)
		};
	}

	private build_kingdom_tag_map(map_data: any): Map<number, string> {
		const kingdoms = Array.isArray(map_data?.kingdoms)
			? map_data.kingdoms
			: Array.isArray(map_data?.response?.kingdoms)
				? map_data.response.kingdoms
				: [];
		const kingdom_map: Map<number, string> = new Map();
		for (const entry of kingdoms) {
			const kingdom_id = safe_number(entry.kingdomId ?? entry.id ?? entry.groupId);
			if (!kingdom_id)
				continue;
			const tag = entry.kingdomTag ?? entry.tag ?? '-';
			kingdom_map.set(kingdom_id, String(tag ?? '-'));
		}
		return kingdom_map;
	}

	private enrich_player_metadata(players: Map<number, Imap_player_snapshot>): void {
		if (players.size === 0)
			return;

		const keys = Array.from(players.keys()).map(id => `Player:${id}`);
		const entries = cache.get(keys);
		for (const entry of entries) {
			const payload = entry.data;
			const player_id = safe_number(payload.playerId ?? payload.id);
			if (!player_id)
				continue;
			const player = players.get(player_id);
			if (!player)
				continue;

			player.name = payload.name ?? player.name;
			player.tribeId = normalize_tribe(payload.tribeId ?? payload.tribe) ?? player.tribeId;
			player.kingdomId = safe_number(payload.kingdomId ?? payload.kingdom) ?? player.kingdomId;
		}
	}
}

interface Imap_snapshot {
	players: Imap_player_snapshot[];
}

interface Imap_player_snapshot {
	playerId: number;
	name: string | null;
	tribeId: tribe | null;
	kingdomId: number | null;
	villages: Imap_village_snapshot[];
}

interface Imap_village_snapshot {
	villageId: number;
	name: string | null;
	x: number;
	y: number;
	population: number | null;
	isMainVillage: boolean;
	isCity: boolean;
}

interface Iplayer_match {
	recent: Imap_player_snapshot;
	aged: Imap_player_snapshot;
}

function safe_number(value: any): number | null {
	if (value === null || value === undefined || value === '')
		return null;
	const candidate = Number(value);
	return Number.isFinite(candidate) ? candidate : null;
}

function normalize_tribe(value: any): tribe | null {
	if (value === null || value === undefined || value === '')
		return null;
	const candidate = String(value);
	return (Object.values(tribe) as string[]).includes(candidate) ? candidate as tribe : null;
}

export default new inactive_finder();
