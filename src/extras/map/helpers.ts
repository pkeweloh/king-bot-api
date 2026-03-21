import { Imap_details, Imap_region_tile } from '../../interfaces';
import cache from '../../cache';
import { village } from '../../gamedata';
import { find_state_data, xy2id } from '../../util';
import { res_type } from '../../data';

export function resolve_map_details(location_id: number): Imap_details | null {
	const ident = village.map_details_ident + location_id;
	const cache_data = cache.get([ident]);
	if (!cache_data || cache_data.length === 0)
		return null;
	return find_state_data(ident, cache_data);
}

export function build_oasis_map(tiles: Imap_region_tile[]): Map<number, Imap_region_tile> {
	const map = new Map<number, Imap_region_tile>();
	for (const tile of tiles) {
		if (!tile || !tile.locationId) continue;
		if (!is_oasis_tile(tile)) continue;
		map.set(tile.locationId, tile);
	}
	return map;
}

export function get_influence_area(x: number, y: number): number[] {
	const area: number[] = [];
	for (let _x = x - 3; _x <= x + 3; _x++) {
		for (let _y = y - 3; _y < y; _y++) {
			area.push(xy2id(_x, _y));
		}
	}
	for (let _x = x - 3; _x <= x + 3; _x++) {
		for (let _y = y; _y <= y + 3; _y++) {
			area.push(xy2id(_x, _y));
		}
	}
	return area;
}

export function get_oasis_type(tile: Imap_region_tile): string | null {
	if (!tile) return null;
	const oasis = tile.oasis;
	if (!oasis) return null;

	if (typeof oasis === 'string') {
		return oasis;
	}

	if (typeof oasis === 'object') {
		return oasis.type ?? oasis.oasis ?? null;
	}

	return null;
}

export function is_oasis_tile(tile: Imap_region_tile): boolean {
	return get_oasis_type(tile) !== null;
}

export function is_resource_tile(tile: Imap_region_tile): boolean {
	if (!tile || !tile.resType) return false;
	switch (tile.resType) {
		case res_type.wood_1:
		case res_type.wood_2:
		case res_type.clay_1:
		case res_type.clay_2:
		case res_type.iron_1:
		case res_type.iron_2:
			return true;
		default:
			return false;
	}
}

export function is_crop_tile(tile: Imap_region_tile): boolean {
	if (!tile || !tile.resType) return false;
	switch (tile.resType) {
		case res_type.c15:
		case res_type.c9:
		case res_type.c7_1:
		case res_type.c7_2:
		case res_type.c7_3:
			return true;
		default:
			return false;
	}
}

export function tile_has_village(details: Imap_details | null): boolean {
	if (!details)
		return false;
	const raw = details.hasVillage ?? 0;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0;
}
