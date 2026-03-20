import map_scanner from './map_scanner';
import { Imap_region_tile } from './interfaces';
import cache from './cache';
import database from './database';
import { RegionBounds } from './util';

export interface Imap_scan_options {
	world_radius?: number;
	ttl_ms?: number;
	force?: boolean;
}

const DEFAULT_WORLD_RADIUS = 60;
const DEFAULT_SCAN_TTL_MS = 15_000;

class world_scan_proxy {
	private cached_tiles: Imap_region_tile[] = [];
	private cached_radius = 0;
	private cached_at = 0;
	private seeded_tiles: Imap_region_tile[] | null = null;

	public async run(options: Imap_scan_options = {}): Promise<Imap_region_tile[]> {
		const radius = options.world_radius ?? this.get_world_radius();
		const ttl = options.ttl_ms ?? DEFAULT_SCAN_TTL_MS;
		const now = Date.now();
		const seeded_ready = this.is_seeded_cache_ready();

		if (seeded_ready && !options.force) {
			if (!this.seeded_tiles) {
				const seeded_radius = this.get_seeded_cache_radius();
				this.seeded_tiles = this.load_seeded_tiles(seeded_radius);
			}
			this.cached_tiles = this.seeded_tiles;
			this.cached_radius = radius;
			this.cached_at = now;
			return this.seeded_tiles;
		}

		if (
			!options.force &&
			this.cached_tiles.length > 0 &&
			radius === this.cached_radius &&
			now - this.cached_at <= ttl
		) {
			return this.cached_tiles;
		}

		const tiles = await map_scanner.scan_world(radius);
		this.cached_tiles = tiles;
		this.cached_radius = radius;
		this.cached_at = now;
		return tiles;
	}

	public clear(): void {
		this.cached_tiles = [];
		this.cached_radius = 0;
		this.cached_at = 0;
		this.seeded_tiles = null;
	}

	private is_seeded_cache_ready(): boolean {
		const last = database.get('map_cache.last_seeded_at').value();
		return Boolean(last);
	}

	private get_seeded_cache_radius(): number {
		const value = database.get('map_cache.radius').value();
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : DEFAULT_WORLD_RADIUS;
	}

	private load_seeded_tiles(radius: number): Imap_region_tile[] {
		const bounds: RegionBounds = {
			minX: -radius,
			maxX: radius,
			minY: -radius,
			maxY: radius
		};
		return cache.get_tiles_in_area(bounds);
	}

	private get_world_radius(): number {
		const stored = Number(database.get('travian_config.world_radius').value());
		return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WORLD_RADIUS;
	}
}

export default new world_scan_proxy();
