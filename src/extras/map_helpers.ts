import { Imap_region_tile } from '../interfaces';

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

export function build_oasis_map(tiles: Imap_region_tile[]): Map<number, Imap_region_tile> {
	const map = new Map<number, Imap_region_tile>();
	for (const tile of tiles) {
		if (!tile || !tile.locationId) continue;
		if (!is_oasis_tile(tile)) continue;
		map.set(tile.locationId, tile);
	}
	return map;
}
