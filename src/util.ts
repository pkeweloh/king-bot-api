import merge from 'deepmerge';
import logger from './logger';
import { Imap_parsed_tile } from './interfaces';

export interface Coordinates {
	x: number;
	y: number;
}

export interface Region {
	rx: number;
	ry: number;
}

export interface Tile {
	locationId: number;
	x: number;
	y: number;
}

export interface RegionBounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export const REGION_SIZE = 7;

export function log(obj: any): void {
	logger.info(obj);
}

export function list_remove(item: any, list: any[]): any[] {
	var idx = list.indexOf(item);
	if (idx != -1) {
		return list.splice(idx, 1); // the second parameter is the number of elements to remove.
	}

	return list;
}

export const sleep = (sec: number) => new Promise(resolve => setTimeout(resolve, sec * 1000));

export const sleep_ms = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const sleep_random_ms = (min_ms: number, max_ms: number) => {
	const delay =
		Math.floor(Math.random() * (max_ms - min_ms + 1)) + min_ms;

	return sleep_ms(delay);
};

export const async_step = async <T>(
	action: () => Promise<T>,
	min_delay_ms: number,
	max_delay_ms: number
): Promise<T> => {
	await sleep_random_ms(min_delay_ms, max_delay_ms);
	const result = await action();
	return result;
};

export function get_date(): number {
	return Math.floor(Number(Date.now()) / 1000);
}

export function get_ms(): number {
	return Date.now();
}

export function find_state_data(ident: string, data: any[], contains: boolean = false): any {
	if (!data)
		return [];
	if (typeof data.find !== 'function')
		return []; // avoid TypeError

	const found_obj = data.find((x: any) => {
		return contains ? x.name.includes(ident) : x.name == ident;
	});
	if (found_obj)
		return found_obj.data;
	logger.error(found_obj, 'find_state_data');
}

export function get_random_int(min: number, max: number): number {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function get_random_string(n: number, charset?: string): string {
	let res = '';
	let chars =
		charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let charLen = chars.length;
	for (var i = 0; i < n; i++) {
		res += chars.charAt(Math.floor(Math.random() * charLen));
	}
	return res;
}

export function get_diff_time(time: number): number {
	return Number(time) - get_date();
}

/**
 * python's zip function equivalent
 * @param arrays array of pairs
 * @returns zip array object
 */
export function zip(arrays: any[]) {
	var shortest = arrays.length == 0 ? [] : arrays.reduce(function (a, b) {
		return a.length < b.length ? a : b;
	});
	return shortest.map(function (_: any, i: string | number) {
		return arrays.map(function (array) {
			return array[i];
		});
	});
}

export function clash_obj(merge_obj: any, ident: string, ident2: string = ''): any {
	let rv: any = {};

	if (!merge_obj) return merge_obj;

	// TODO prettify this function a little bit
	// merges response and cache together, response overwrites cache
	if (ident2) {
		if (merge_obj[ident] && merge_obj[ident2]) {
			merge_obj = merge(merge_obj[ident], merge_obj[ident2]);
		} else if (merge_obj[ident]) {
			merge_obj = merge_obj[ident];
		} else if (merge_obj[ident2]) {
			merge_obj = merge_obj[ident2];
		}
	} else {
		if (merge_obj[ident]) merge_obj = merge_obj[ident];
	}

	if (Array.isArray(merge_obj)) {
		rv = [];

		for (let i = 0; i < merge_obj.length; i++) {
			rv.push(clash_obj(merge_obj[i], ident, ident2));
		}

		return rv;
	}


	if (is_object(merge_obj)) {
		rv = {};

		let keys = Object.keys(merge_obj);
		for (let i = 0; i < keys.length; i++) {
			rv[keys[i]] = clash_obj(merge_obj[keys[i]], ident, ident2);
		}

		return rv;
	}

	return merge_obj;
}

export function is_object(val: any) {
	if (val === null) { return false; }
	return ((typeof val === 'function') || (typeof val === 'object'));
}

export function camelcase_to_string(text: string) {
	if (!text)
		return '';
	return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

export function range(start: number, end: number): number[] {
	start = Math.floor(start);
	end = Math.floor(end);

	const diff = end - start;
	if (diff === 0) {
		return [start];
	}

	const keys = Array(Math.abs(diff) + 1).keys();
	return Array.from(keys).map(x => {
		const increment = end > start ? x : -x;
		return start + increment;
	});
}

export function normalize_player_name(name: string | null | undefined): string | null {
	if (!name)
		return null;
	const normalized = String(name).trim();
	if (normalized === '' || normalized === '0')
		return null;
	return normalized;
}

export function safe_number(value: any): number | null {
	if (value === null || value === undefined || value === '')
		return null;
	const numeric = Number(value);
	if (!Number.isFinite(numeric))
		return null;
	return Math.floor(numeric);
}

export function build_map_player_name_map(map_data: any): Map<number, string> {
	const players = Array.isArray(map_data?.players)
		? map_data.players
		: Array.isArray(map_data?.response?.players)
			? map_data.response.players
			: [];
	const map = new Map<number, string>();
	for (const player of players) {
		const player_id = safe_number(player.playerId ?? player.player_id ?? player.id);
		const name = normalize_player_name(player.name ?? player.playerName ?? player.displayName ?? null);
		if (player_id && name) {
			map.set(player_id, name);
		}
	}
	return map;
}

export function resolve_map_player_name(playerId: number | null, player_map: Map<number, string>, fallback: string | null | undefined): string | null {
	if (playerId !== null && player_map.has(playerId))
		return player_map.get(playerId) ?? null;
	return normalize_player_name(fallback);
}

export interface IMistakeOptions {
	chance?: number;      // probability 0..1
	min_delay?: number;    // minimum delay if mistake occurs
	max_delay?: number;    // maximum delay if mistake occurs
}

// default levels for each type of mistake
const default_mistake_levels = {
	minor: { chance: 0.25, min_delay: 200, max_delay: 800 },
	medium: { chance: 0.1, min_delay: 1000, max_delay: 2000 },
	major: { chance: 0.02, min_delay: 2000, max_delay: 5000 }
};

/**
 * return a random human mistake delay
 * accepts optional overrides
 */
export const random_human_mistake = (level: keyof typeof default_mistake_levels = 'minor', options: IMistakeOptions = {}): number => {
	const { chance, min_delay, max_delay } = { ...default_mistake_levels[level], ...options };
	if (Math.random() > chance) return 0;
	return get_random_int(min_delay, max_delay);
};

/**
 * converts map coordinates to location_id
 * x + 16384 + 32768 * (y + 16384)
 */
export function xy2id(x: number, y: number): number {
	return x + 16384 + 32768 * (y + 16384);
}

/**
 * converts location_id to map coordinates
 */
export function id2xy(id: number): Coordinates {
	const y = Math.floor(id / 32768) - 16384;
	const x = (id % 32768) - 16384;
	return { x, y };
}

/**
 * calculates distance between two coordinates
 */
export function get_distance(a: Coordinates, b: Coordinates): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * returns the region a tile belongs to
 */
export function tile_to_region(x: number, y: number): Region {
	return {
		rx: Math.floor(x / REGION_SIZE),
		ry: Math.floor(y / REGION_SIZE)
	};
}

/**
 * returns region bounds
 */
export function region_bounds(rx: number, ry: number): RegionBounds {
	const minX = rx * REGION_SIZE;
	const minY = ry * REGION_SIZE;

	return {
		minX,
		maxX: minX + REGION_SIZE - 1,
		minY,
		maxY: minY + REGION_SIZE - 1
	};
}

/**
 * iterates through all tiles within a region
 */
export function iterate_region_tiles(
	rx: number,
	ry: number,
	callback: (tile: Tile) => void
) {
	const bounds = region_bounds(rx, ry);

	for (let x = bounds.minX; x <= bounds.maxX; x++) {
		for (let y = bounds.minY; y <= bounds.maxY; y++) {
			const locationId = xy2id(x, y);

			callback({
				x,
				y,
				locationId
			});
		}
	}
}

/**
 * parses tile_details response
 */
export function parse_tile_details(data: any): Imap_parsed_tile | null {
	if (!data) return null;

	const x = data.x;
	const y = data.y;

	return {
		x,
		y,
		locationId: xy2id(x, y),
		villageId: data.villageId,
		hasVillage: Boolean(data.villageId),
		type: data.type
	};
}

/**
 * generates all location_ids within a radius
 */
export function generate_tiles_in_radius(
	center: Coordinates,
	radius: number
): Tile[] {
	const tiles: Tile[] = [];

	for (let x = center.x - radius; x <= center.x + radius; x++) {
		for (let y = center.y - radius; y <= center.y + radius; y++) {
			tiles.push({
				x,
				y,
				locationId: xy2id(x, y)
			});
		}
	}

	return tiles;
}

/**
 * checks if a tile is within a radius
 */
export function is_inside_radius(
	a: Coordinates,
	b: Coordinates,
	radius: number
): boolean {
	return get_distance(a, b) <= radius;
}
