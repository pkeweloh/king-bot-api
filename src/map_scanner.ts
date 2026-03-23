import { xy2id, id2xy, is_object, sleep_ms, sleep_random_ms } from './util';
import api from './api';
import cache from './cache';
import logger from './logger';
import { Imap_region_tile, Imap_village_tile } from './interfaces';

interface Iscan_movement {
	x: number;
	y: number;
	direction: 'ltr' | 'rtl';
	row: number;
}

class map_scanner {
	private accumulated_regions: Map<number, Set<number>> = new Map();
	private cached_layer1_regions: Map<number, number> = new Map();
	private cached_layer2_regions: Map<number, number> = new Map();
	private cached_layer3_regions: Map<number, number> = new Map();
	private request_timeout: NodeJS.Timeout | null = null;
	private readonly request_delay = 10;
	private readonly world_scan_batch = 8;
	private readonly world_scan_step = 50;
	private readonly world_scan_continuous_chunk = 3;
	private readonly world_scan_step_pause_ms = 120;
	private readonly world_scan_pause_min_ms = 300;
	private readonly world_scan_pause_max_ms = 800;
	private world_village_index: Map<number, Imap_village_tile> = new Map();
	private readonly layer1_cache_ttl_ms = 30 * 60_000;
	private readonly layer2_cache_ttl_ms = 30 * 60_000;
	private readonly layer3_cache_ttl_ms = 60 * 60_000;
	private force_refresh_cache = false;
	private seeded_cache_persistent = false;
	private map_data_cells: Map<string, any> = new Map();
	private map_data_regions: { [layer: number]: number[] } = { 1: [], 2: [], 3: [] };
	private map_data_cursor: { [layer: number]: number } = { 1: 0, 2: 0, 3: 0 };
	private map_data_loaded_radius: number | null = null;
	private current_hover_direction: 'ltr' | 'rtl' = 'ltr';
	private current_world_batch_threshold = 0;
	private readonly HEATMAP_REFRESH_INTERVAL_MS = 35_000;
	private readonly HEATMAP_TRIGGER_CHANCE = 0.35;
	private heatmap_last_triggered = 0;
	private heatmap_refreshing = false;
	private layer2_refresh_cursor = 0;

	public clear(): void {
		this.accumulated_regions.clear();
		if (this.request_timeout) {
			clearTimeout(this.request_timeout);
			this.request_timeout = null;
		}
		this.current_world_batch_threshold = 0;
	}

	public clear_all(): void {
		this.clear();
		this.reset_world_villages();
		this.cached_layer1_regions.clear();
		this.cached_layer2_regions.clear();
		this.cached_layer3_regions.clear();
		this.force_refresh_cache = false;
		this.seeded_cache_persistent = false;
		this.heatmap_last_triggered = 0;
		this.heatmap_refreshing = false;
		this.layer2_refresh_cursor = 0;
		this.reset_world_batch_threshold();
		logger.debug('all caches cleared including layer 3', 'map_scanner');
	}

	public get_layers_cache_stats(): {l1_cached: number; l1_total: number; l2_cached: number; l2_total: number; l3_cached: number; l3_total: number} {
		return {
			l1_cached: this.cached_layer1_regions.size,
			l1_total: this.accumulated_regions.get(1)?.size || 0,
			l2_cached: this.cached_layer2_regions.size,
			l2_total: this.accumulated_regions.get(2)?.size || 0,
			l3_cached: this.cached_layer3_regions.size,
			l3_total: this.accumulated_regions.get(3)?.size || 0
		};
	}

	public get_world_villages(): Imap_village_tile[] {
		return Array.from(this.world_village_index.values());
	}

	public async scan(center_x: number, center_y: number): Promise<Imap_region_tile[]> {
		this.clear();
		this.load_map_data_if_needed();
		this.reset_map_data_hovered();
		const previous_force_refresh = this.force_refresh_cache;
		this.force_refresh_cache = true;
		try {
			const scan_mode = Math.random();
			let type = 'centered';
			if (scan_mode < 0.4) type = 'large';
			else if (scan_mode < 0.7) type = 'dual';
			else if (scan_mode < 0.9) type = 'square';
			logger.debug(`using ${type} scan mode`, 'map_scanner');

			switch (type) {
				case 'large':
					this.simulate_map_movement({ x: center_x, y: center_y }, 4);
					break;
				case 'dual':
					await this.simulate_map_movement_continuous([
						{ x: center_x - 3, y: center_y },
						{ x: center_x + 3, y: center_y }
					]);
					break;
				case 'square':
					await this.simulate_map_movement_continuous([
						{ x: center_x - 5, y: center_y },
						{ x: center_x - 2, y: center_y },
						{ x: center_x + 1, y: center_y },
						{ x: center_x + 4, y: center_y }
					]);
					break;
				default:
					this.simulate_map_movement({ x: center_x, y: center_y });
					break;
			}

			await sleep_ms(20);
			await this.maybe_trigger_heatmap_refresh();
			const stats = this.get_layers_cache_stats();
			logger.debug(`cache L1: ${stats.l1_cached} persistent, ${stats.l1_total} accumulated`, 'map_scanner');
			logger.debug(`cache L2: ${stats.l2_cached} persistent, ${stats.l2_total} accumulated`, 'map_scanner');
			logger.debug(`cache L3: ${stats.l3_cached} persistent, ${stats.l3_total} accumulated`, 'map_scanner');
			return await this.send_accumulated_request([1, 3]);
		} finally {
			this.force_refresh_cache = previous_force_refresh;
		}
	}

	public async scan_world(
		world_radius: number,
		options: {
			chunk_handler?: (tiles: Imap_region_tile[]) => Promise<void>;
			collect_tiles?: boolean;
			seed?: boolean;
		} = {}
	): Promise<Imap_region_tile[]> {
		this.clear();
		this.reset_world_villages();
		logger.info(`starting world scan radius ${world_radius}`, 'map_scanner');
		this.load_map_data_if_needed(world_radius);
		this.reset_map_data_hovered();
		const seed_requested = Boolean(options.seed);
		if (seed_requested) {
			this.force_refresh_cache = true;
			this.seeded_cache_persistent = false;
		}

		const path = this.build_world_path(world_radius, this.world_scan_step);
		const collect_tiles = options.collect_tiles ?? true;
		const chunk_handler = options.chunk_handler;
		const collected_tiles: Imap_region_tile[] = collect_tiles ? [] : [];
		let window: Iscan_movement[] = [];
		let seed_completed = false;

		try {
			for (let i = 0; i < path.length; i++) {
				window.push(path[i]);
				const atEnd = i === path.length - 1;
				if (window.length === this.world_scan_continuous_chunk || atEnd) {
					await this.simulate_map_movement_continuous(window);
					this.enqueue_map_data_regions();
					if (this.should_flush_world_scan() || atEnd) {
						const tiles = await this.flush_accumulated_request([1, 3]);
						if (tiles.length > 0) {
							if (chunk_handler) await chunk_handler(tiles);
							if (collect_tiles) collected_tiles.push(...tiles);
						}
					}
					if (!atEnd) {
						await sleep_ms(this.random_pause_ms());
						await this.maybe_trigger_heatmap_refresh();
					}
					const last_movement = window[window.length - 1];
					window = atEnd ? [] : last_movement ? [last_movement] : [];
				} else {
					await sleep_ms(this.world_scan_step_pause_ms);
					await this.maybe_trigger_heatmap_refresh();
				}
			}
			while (this.has_pending_map_data_regions([1, 3])) {
				const tiles = await this.flush_accumulated_request([1, 3]);
				if (tiles.length > 0) {
					if (chunk_handler) await chunk_handler(tiles);
					if (collect_tiles) collected_tiles.push(...tiles);
				} else {
					break;
				}
			}
			logger.info(`world scan complete (${collected_tiles.length} tiles, ${this.world_village_index.size} villages)`, 'map_scanner');
			seed_completed = true;
			return collect_tiles ? collected_tiles : [];
		} finally {
			if (seed_requested) {
				this.force_refresh_cache = false;
				this.seeded_cache_persistent = seed_completed;
			}
		}
	}

	private async flush_accumulated_request(layers: number[] = [1, 3]): Promise<Imap_region_tile[]> {
		this.enqueue_map_data_regions(layers);
		const tiles = await this.send_accumulated_request(layers);
		if (tiles.length > 0 && layers.includes(1)) this.track_world_villages(tiles);
		if (layers.includes(1)) this.reset_world_batch_threshold();
		return tiles;
	}

	private should_flush_world_scan(): boolean {
		const layer1 = this.accumulated_regions.get(1);
		return Boolean(layer1 && layer1.size >= this.get_world_batch_threshold());
	}

	private async send_accumulated_request(layers: number[]): Promise<Imap_region_tile[]> {
		let hasRegions = false;
		const regionIdCollection: { [layer: number]: number[] } = {};
		for (const layer of layers) {
			const regionIds = this.accumulated_regions.get(layer);
			const regionArray = Array.from(regionIds ?? []);
			const filtered = regionArray.filter(id => id !== null && id !== undefined && !isNaN(id));
			regionIdCollection[layer] = filtered;
			if (filtered.length > 0) hasRegions = true;
		}

		if (!hasRegions) {
			logger.warn('no regions accumulated for request', 'map_scanner');
			return [];
		}

		for (let i = 1; i <= 6; i++) {
			if (!regionIdCollection[i]) regionIdCollection[i] = [];
		}

		if (regionIdCollection[1].length > 0)
			this.record_layer_cache(regionIdCollection[1], this.cached_layer1_regions);
		if (regionIdCollection[2].length > 0)
			this.record_layer_cache(regionIdCollection[2], this.cached_layer2_regions);
		if (regionIdCollection[3].length > 0)
			this.record_layer_cache(regionIdCollection[3], this.cached_layer3_regions);

		const total_regions = layers.reduce((sum, layer) => sum + (regionIdCollection[layer]?.length ?? 0), 0);
		const layer1_count = regionIdCollection[1]?.length ?? 0;
		const layer2_count = regionIdCollection[2]?.length ?? 0;
		const layer3_count = regionIdCollection[3]?.length ?? 0;
		logger.debug(`sending reactive request with ${total_regions} regions (l1: ${layer1_count}, l2: ${layer2_count}, l3: ${layer3_count})`, 'map_scanner');

		await this.delay_before_request(total_regions);
		try {
			const response = await api.get_by_region_ids(regionIdCollection);
			if (!response) return [];
			cache.sync_region_response(response);
			layers.forEach(layer => this.accumulated_regions.delete(layer));
			return parse_region_collection(response);
		} catch (error) {
			logger.error(`failed to send accumulated request: ${error}`, 'map_scanner');
			return [];
		}
	}

	private async simulate_map_movement(center: { x: number; y: number }, viewport_size: number = 3): Promise<void> {
		const visible_tiles = this.calculate_visible_tiles(center, viewport_size);
		visible_tiles.forEach(tile => this.process_visible_tile(tile.x, tile.y));
		await this.simulate_mouse_hovers(center);
	}

	private async delay_before_request(total_regions: number): Promise<void> {
		if (!total_regions) return;
		const base_delay = 120;
		const per_region = 35;
		const computed = base_delay + total_regions * per_region;
		const target = Math.min(900, computed);
		const min_delay = Math.max(80, target - 120);
		const max_delay = target + 120;
		await sleep_random_ms(min_delay, max_delay);
	}

	private async simulate_map_movement_continuous(movements: Array<{ x: number; y: number; direction?: 'ltr' | 'rtl'; row?: number }>): Promise<void> {
		for (let i = 0; i < movements.length; i++) {
			const center = movements[i];
			const visible_tiles = this.calculate_visible_tiles(center);
			visible_tiles.forEach(tile => this.process_visible_tile(tile.x, tile.y));
			if (i < movements.length - 1) await sleep_random_ms(25, 60);
		}
		await this.simulate_mouse_hovers_continuous(movements);
	}

	private async simulate_mouse_hovers(center: { x: number; y: number }): Promise<void> {
		const line_tiles = this.calculate_line_tiles(this.calculate_visible_tiles(center));
		await this.process_hover_line(line_tiles, 'centered viewport');
	}

	private async simulate_mouse_hovers_continuous(movements: Array<{ x: number; y: number; direction?: 'ltr' | 'rtl'; row?: number }>): Promise<void> {
		const continuous_line = this.calculate_continuous_line(movements);
		await this.process_hover_line(continuous_line, 'continuous viewport line');
	}

	private async process_hover_line(line_tiles: { x: number; y: number }[], context: string): Promise<void> {
		this.load_map_data_if_needed();
		for (const tile of line_tiles) {
			const tile_key = `${tile.x},${tile.y}`;
			const map_data_tile = this.map_data_cells.get(tile_key);
			if (!map_data_tile) continue;
			if (map_data_tile._hovered) continue;
			if (!this.should_hover_tile(map_data_tile)) continue;
			map_data_tile._hovered = true;
			try {
				await this.simulate_ui_requests(map_data_tile, tile);
			} catch (error) {
				const tile_id = xy2id(tile.x, tile.y);
				logger.debug(`failed to process tile ${tile_id}: ${error}`, 'map_scanner');
			} finally {
				await sleep_random_ms(30, 80);
			}
		}
	}

	private async simulate_ui_requests(cell: any, tile: { x: number; y: number }): Promise<void> {
		if (!cell) return;
		const location_id = this.resolve_map_data_location_id(cell, tile);
		if (!location_id) return;
		const ident = 'MapDetails:' + location_id;

		const is_oasis = Boolean(cell.oasis && cell.oasis !== '0');
		if (is_oasis) {
			logger.debug(`simulating mouse hover over an oasis at ${tile.x},${tile.y} - forcing ${ident} request`, 'map_scanner');
			await api.get_cache([ident]);
			await sleep_ms(50);
		}

		const player_id = this.resolve_map_data_player_id(cell);
		if (player_id) {
			const player_ident = 'Player:' + player_id;
			logger.debug(`simulating mouse hover over a village at ${tile.x},${tile.y} - forcing ${player_ident} request`, 'map_scanner');
			await api.get_cache([player_ident]);
			await sleep_ms(50);
		}
	}

	private calculate_continuous_line(movements: Array<{ x: number; y: number; direction?: 'ltr' | 'rtl'; row?: number }>): { x: number; y: number }[] {
		const continuous_line: { x: number; y: number }[] = [];
		const seen = new Set<string>();
		for (const center of movements) {
			const visible_tiles = this.calculate_visible_tiles(center);
			const direction = center.direction ?? this.current_hover_direction;
			const line_tiles = this.calculate_line_tiles(visible_tiles, direction);
			for (const tile of line_tiles) {
				const key = `${tile.x},${tile.y}`;
				if (!seen.has(key)) {
					seen.add(key);
					continuous_line.push(tile);
				}
			}
			this.current_hover_direction = direction;
		}
		return continuous_line;
	}

	private calculate_line_tiles(visible_tiles: { x: number; y: number }[], direction: 'ltr' | 'rtl' = 'ltr'): { x: number; y: number }[] {
		if (visible_tiles.length === 0) return [];

		const grouped: Map<number, number[]> = new Map();
		let min_y = Infinity;
		let max_y = -Infinity;

		for (const tile of visible_tiles) {
			if (!grouped.has(tile.x)) grouped.set(tile.x, []);
			grouped.get(tile.x)!.push(tile.y);
			min_y = Math.min(min_y, tile.y);
			max_y = Math.max(max_y, tile.y);
		}

		if (grouped.size === 0) return [];

		const x_keys = Array.from(grouped.keys()).sort((a, b) => direction === 'ltr' ? a - b : b - a);
		const vertical_range = Math.max(0, max_y - min_y);
		const start_y = min_y + Math.floor(Math.random() * (vertical_range + 1));
		const end_y = min_y + Math.floor(Math.random() * (vertical_range + 1));
		const amplitude = Math.max(1, Math.round(vertical_range / 3));
		const line_tiles: { x: number; y: number }[] = [];
		const total_steps = Math.max(1, x_keys.length - 1);
		const phase = Math.random() * Math.PI * 2;

		const clampY = (value: number) => {
			if (value < min_y) return min_y;
			if (value > max_y) return max_y;
			return value;
		};

		for (let index = 0; index < x_keys.length; index++) {
			const x = x_keys[index];
			const progression = total_steps === 0 ? 0 : index / total_steps;
			const base_y = Math.round(start_y + (end_y - start_y) * progression);
			const wave = Math.sin((progression + Math.random() * 0.5) * Math.PI * 2 + phase);
			const jitter = Math.round(wave * amplitude);
			const y = clampY(base_y + jitter);
			line_tiles.push({ x, y });
		}

		return line_tiles;
	}

	private calculate_visible_tiles(center: { x: number; y: number }, viewport_size: number = 3): { x: number; y: number }[] {
		const tiles: { x: number; y: number }[] = [];
		for (let dx = -viewport_size; dx <= viewport_size; dx++) {
			for (let dy = -viewport_size; dy <= viewport_size; dy++) {
				tiles.push({ x: center.x + dx, y: center.y + dy });
			}
		}
		return tiles;
	}

	private process_visible_tile(tile_x: number, tile_y: number): void {
		const region_x_1 = Math.floor(tile_x / 7);
		const region_y_1 = Math.floor(tile_y / 7);
		const region_id_1 = xy2id(region_x_1, region_y_1);

		const region_x_3 = Math.floor(tile_x / 21);
		const region_y_3 = Math.floor(tile_y / 21);
		const region_id_3 = xy2id(region_x_3, region_y_3);

		if (!this.accumulated_regions.has(1)) this.accumulated_regions.set(1, new Set());
		if (!this.has_valid_layer1_cache(region_id_1)) {
			this.accumulated_regions.get(1)!.add(region_id_1);
		}

		if (!this.accumulated_regions.has(3)) this.accumulated_regions.set(3, new Set());
		if (!this.has_valid_layer3_cache(region_id_3)) {
			this.accumulated_regions.get(3)!.add(region_id_3);
		}

		if (!this.request_timeout) {
			this.request_timeout = setTimeout(() => {
				this.request_timeout = null;
			}, this.request_delay);
		}
	}

	private build_world_path(radius: number, step: number): Iscan_movement[] {
		const coords = this.build_coordinate_array(radius, step);
		const path: Iscan_movement[] = [];
		if (coords.length === 0) return path;

		const reversed = [...coords].reverse();
		for (let row = 0; row < coords.length; row++) {
			const y = coords[row];
			const direction: 'ltr' | 'rtl' = row % 2 === 0 ? 'ltr' : 'rtl';
			const row_coords = direction === 'ltr' ? coords : reversed;
			for (const x of row_coords) {
				path.push({ x, y, direction, row });
			}
		}
		return path;
	}

	private build_coordinate_array(radius: number, step: number): number[] {
		const set = new Set<number>();
		for (let coord = -radius; coord <= radius; coord += step) set.add(coord);
		set.add(-radius);
		set.add(radius);
		set.add(0);
		return Array.from(set).sort((a, b) => a - b);
	}

	private compute_random_batch_threshold(): number {
		const base = Math.max(4, Math.floor(this.world_scan_batch * 0.6));
		const jitter_max = Math.max(1, Math.floor(this.world_scan_batch / 2));
		return base + Math.floor(Math.random() * jitter_max);
	}

	private reset_world_batch_threshold(): void {
		this.current_world_batch_threshold = this.compute_random_batch_threshold();
	}

	private get_world_batch_threshold(): number {
		if (!this.current_world_batch_threshold) this.reset_world_batch_threshold();
		return this.current_world_batch_threshold;
	}

	private get_layer_batch_limit(layer: number): number {
		if (layer === 2) return Math.max(4, Math.floor(this.world_scan_batch / 3));
		return this.get_world_batch_threshold();
	}

	private random_pause_ms(): number {
		const range = this.world_scan_pause_max_ms - this.world_scan_pause_min_ms + 1;
		return this.world_scan_pause_min_ms + Math.floor(Math.random() * range);
	}

	private reset_world_villages(): void {
		this.world_village_index.clear();
	}

	private track_world_villages(tiles: Imap_region_tile[]): void {
		for (const tile of tiles) {
			if (!tile.hasVillage || !tile.villageId) continue;
			this.world_village_index.set(tile.locationId, {
				x: tile.x,
				y: tile.y,
				locationId: tile.locationId,
				villageId: tile.villageId,
				type: tile.type ?? tile.village?.type ?? undefined
			});
		}
	}

	private has_valid_layer1_cache(region_id: number): boolean {
		return this.has_valid_layer_cache(1, region_id, this.cached_layer1_regions, this.layer1_cache_ttl_ms);
	}

	private has_valid_layer3_cache(region_id: number): boolean {
		return this.has_valid_layer_cache(3, region_id, this.cached_layer3_regions, this.layer3_cache_ttl_ms);
	}

	private has_valid_layer_cache(layer: number, region_id: number, cache_map: Map<number, number>, ttl: number): boolean {
		if (this.force_refresh_cache) return false;
		if (this.seeded_cache_persistent) return true;
		const now = Date.now();
		const cached_ts = cache_map.get(region_id);
		if (cached_ts && now - cached_ts <= ttl) return true;
		if (cached_ts) cache_map.delete(region_id);
		const persisted_ts = cache.get_region_last_updated(layer, region_id);
		if (persisted_ts && now - persisted_ts <= ttl) {
			cache_map.set(region_id, persisted_ts);
			return true;
		}
		return false;
	}

	private record_layer_cache(region_ids: number[], cache_map: Map<number, number>): void {
		const now = Date.now();
		for (const region_id of region_ids) cache_map.set(region_id, now);
	}

	private load_map_data_if_needed(radius?: number): void {
		if (radius != null && this.map_data_loaded_radius === radius && this.map_data_cells.size > 0) return;
		if (radius == null && this.map_data_cells.size > 0) return;
		this.load_map_data_cells(radius);
	}

	private load_map_data_cells(radius?: number): void {
		this.map_data_cells.clear();
		this.map_data_regions = { 1: [], 2: [], 3: [] };
		this.map_data_cursor = { 1: 0, 2: 0, 3: 0 };
		this.map_data_loaded_radius = radius ?? null;

		const map_data = cache.load_map_data();
		if (!map_data) return;
		const cells = map_data.map?.cells ?? map_data.cells ?? [];
		if (!Array.isArray(cells) || cells.length === 0) return;

		const limit = Number.isFinite(radius ?? Infinity) ? radius : Infinity;
		const layer1 = new Map<number, { x: number; y: number }>();
		const layer2 = new Map<number, { x: number; y: number }>();
		const layer3 = new Map<number, { x: number; y: number }>();

		for (const cell of cells) {
			const cell_x = Number(cell.x);
			const cell_y = Number(cell.y);
			if (!Number.isFinite(cell_x) || !Number.isFinite(cell_y)) continue;
			if (Math.abs(cell_x) > limit || Math.abs(cell_y) > limit) continue;
			const key = `${cell_x},${cell_y}`;
			this.map_data_cells.set(key, cell);

			const region_x1 = Math.floor(cell_x / 7);
			const region_y1 = Math.floor(cell_y / 7);
			const layer_id_1 = xy2id(region_x1, region_y1);
			layer1.set(layer_id_1, { x: region_x1, y: region_y1 });
			layer2.set(layer_id_1, { x: region_x1, y: region_y1 });

			const region_x3 = Math.floor(cell_x / 21);
			const region_y3 = Math.floor(cell_y / 21);
			layer3.set(xy2id(region_x3, region_y3), { x: region_x3, y: region_y3 });
		}

		this.map_data_regions[1] = this.sort_regions_zigzag(layer1);
		this.map_data_regions[2] = this.sort_regions_zigzag(layer2);
		this.map_data_regions[3] = this.sort_regions_zigzag(layer3);
	}

	private sort_regions_zigzag(regions: Map<number, { x: number; y: number }>): number[] {
		if (regions.size === 0) return [];
		const entries = Array.from(regions.entries());
		let minY = Infinity;
		let maxY = -Infinity;
		for (const [, coords] of entries) {
			minY = Math.min(minY, coords.y);
			maxY = Math.max(maxY, coords.y);
		}
		const rows: Map<number, { regionId: number; x: number }[]> = new Map();
		for (const [regionId, coords] of entries) {
			if (!rows.has(coords.y)) rows.set(coords.y, []);
			rows.get(coords.y)!.push({ regionId, x: coords.x });
		}
		const sorted: number[] = [];
		const y_coords = Array.from(rows.keys()).sort((a, b) => a - b);
		y_coords.forEach((y, index) => {
			const row = rows.get(y)!;
			row.sort((a, b) => a.x - b.x);
			if (index % 2 === 0) {
				sorted.push(...row.map(entry => entry.regionId));
			} else {
				sorted.push(...row.map(entry => entry.regionId).reverse());
			}
		});
		return sorted;
	}

	private reset_map_data_hovered(): void {
		for (const cell of this.map_data_cells.values()) {
			if (cell && cell._hovered) delete cell._hovered;
		}
	}

	private enqueue_map_data_regions(layers: number[] = [1, 3]): void {
		for (const layer of layers) {
			const queue = this.map_data_regions[layer] ?? [];
			if (!queue.length) continue;
			if (!this.accumulated_regions.has(layer)) this.accumulated_regions.set(layer, new Set());
			const accumulator = this.accumulated_regions.get(layer)!;
			const limit = this.get_layer_batch_limit(layer);
			while (accumulator.size < limit && this.map_data_cursor[layer] < queue.length) {
				const region_id = queue[this.map_data_cursor[layer]++];
				if (region_id && !accumulator.has(region_id)) {
					accumulator.add(region_id);
				}
			}
		}
	}

	private has_pending_map_data_regions(layers: number[] = [1, 3]): boolean {
		return layers.some(layer => this.map_data_cursor[layer] < (this.map_data_regions[layer]?.length ?? 0));
	}

	private async maybe_trigger_heatmap_refresh(): Promise<void> {
		if (this.heatmap_refreshing) return;
		const now = Date.now();
		if (this.heatmap_last_triggered > 0 && now - this.heatmap_last_triggered < this.HEATMAP_REFRESH_INTERVAL_MS) return;
		if (Math.random() >= this.HEATMAP_TRIGGER_CHANCE) return;
		await this.perform_heatmap_refresh();
	}

	private async perform_heatmap_refresh(): Promise<void> {
		if (!this.map_data_regions[2]?.length) return;
		this.heatmap_refreshing = true;
		try {
			const response = await api.get_heatmap_maximums();
			const count = this.resolve_heatmap_refresh_count(response);
			const added = this.enqueue_heatmap_layer2_regions(count);
			if (added > 0) {
				logger.debug(`heatmap refresh queued ${added} layer-2 regions`, 'map_scanner');
				await this.flush_accumulated_request([2]);
			}
		} catch (error) {
			logger.error(`heatmap refresh failed: ${error}`, 'map_scanner');
		} finally {
			this.heatmap_last_triggered = Date.now();
			this.heatmap_refreshing = false;
		}
	}

	private resolve_heatmap_refresh_count(payload: any): number {
		if (!payload) return 1;
		const sum = (Number(payload['4']) || 0) + (Number(payload['5']) || 0) + (Number(payload['6']) || 0);
		if (!Number.isFinite(sum) || sum <= 0) return 1;
		const normalized = Math.round(sum / 2500) || 1;
		return Math.max(1, Math.min(6, normalized));
	}

	private enqueue_heatmap_layer2_regions(count: number): number {
		const available = this.map_data_regions[2] ?? [];
		if (!available.length || count <= 0) return 0;
		if (!this.accumulated_regions.has(2)) this.accumulated_regions.set(2, new Set());
		const accumulator = this.accumulated_regions.get(2)!;
		let added = 0;
		let iterations = 0;
		const maxAttempts = available.length * 2;
		while (added < count && iterations < maxAttempts) {
			const index = (this.layer2_refresh_cursor + iterations) % available.length;
			const region_id = available[index];
			if (region_id && !accumulator.has(region_id) && !this.has_valid_layer2_cache(region_id)) {
				accumulator.add(region_id);
				added++;
			}
			iterations++;
		}
		this.layer2_refresh_cursor = (this.layer2_refresh_cursor + iterations) % available.length;
		return added;
	}

	private has_valid_layer2_cache(region_id: number): boolean {
		return this.has_valid_layer_cache(2, region_id, this.cached_layer2_regions, this.layer2_cache_ttl_ms);
	}

	private should_hover_tile(cell: any): boolean {
		if (!cell) return false;
		if (cell.oasis && cell.oasis !== '0') return true;
		if ((cell.villageId ?? cell.playerId ?? 0) > 0) return true;
		if (cell.kingdomId && Number(cell.kingdomId) > 0) return true;
		const resType = cell.resType ?? cell.landscape ?? '0';
		return Boolean(resType && resType !== '0');
	}

	private resolve_map_data_location_id(cell: any, tile: { x: number; y: number }): number | null {
		const candidate = number_or_null(cell.id ?? cell.locationId ?? cell.tileId);
		if (candidate !== null) return candidate;
		const x = Number(cell.x ?? tile.x);
		const y = Number(cell.y ?? tile.y);
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
		return xy2id(x, y);
	}

	private resolve_map_data_player_id(cell: any): number | null {
		return number_or_null(cell.playerId ?? cell.villageId ?? cell.ownerId ?? cell.player ?? cell.owner);
	}
}

function parse_region_collection(response: any): Imap_region_tile[] {
	const tiles: Imap_region_tile[] = [];
	if (!response) return tiles;
	if (Array.isArray(response.tiles)) return response.tiles.map(normalize_tile).filter(Boolean) as Imap_region_tile[];
	for (const layer_data of Object.values(response)) {
		const entries = extract_region_entries(layer_data);
		if (!entries) continue;
		for (const region_value of Object.values(entries)) {
			flatten_region_tiles(region_value).forEach(tile => {
				const normalized = normalize_tile(tile);
				if (normalized) tiles.push(normalized);
			});
		}
	}
	return tiles;
}

function extract_region_entries(layer_data: any): { [key: string]: any } | null {
	if (!layer_data) return null;
	if (layer_data.region && typeof layer_data.region === 'object') {
		return layer_data.region;
	}
	const numeric_entries: { [key: string]: any } = {};
	for (const key of Object.keys(layer_data)) {
		const numeric_key = Number(key);
		if (!Number.isNaN(numeric_key)) numeric_entries[key] = layer_data[key];
	}
	return Object.keys(numeric_entries).length ? numeric_entries : null;
}

function flatten_region_tiles(region_value: any): any[] {
	if (!region_value) return [];
	if (Array.isArray(region_value)) {
		const flattened: any[] = [];
		for (const entry of region_value) {
			if (Array.isArray(entry)) flattened.push(...flatten_region_tiles(entry));
			else if (entry) flattened.push(entry);
		}
		return flattened;
	}
	if (region_value.tiles && Array.isArray(region_value.tiles)) return flatten_region_tiles(region_value.tiles);
	if (is_object(region_value)) {
		const flattened: any[] = [];
		for (const entry of Object.values(region_value)) {
			if (entry) flattened.push(entry);
		}
		return flattened;
	}
	return [];
}

function normalize_tile(tile: any): Imap_region_tile | null {
	if (!tile) return null;
	const coords = resolve_tile_coordinates(tile);
	if (!coords) return null;
	const { locationId } = coords;
	const playerId = number_or_null(tile.playerId ?? tile.player ?? tile.owner);
	const villageId = number_or_null(tile.village?.villageId ?? tile.villageId ?? tile.playerId);
	const resType = tile.resType ?? tile.landscape ?? null;
	const type = tile.type ?? tile.village?.type ?? null;
	const owner = number_or_null(tile.owner ?? tile.player ?? tile.playerId);
	const hasVillage = Boolean(tile.hasVillage ?? villageId ?? playerId ?? tile.village);
	return {
		...tile,
		id: locationId,
		locationId,
		playerId,
		villageId,
		hasVillage,
		type,
		resType,
		owner,
		landscape: tile.landscape ?? null,
		x: coords.coords.x,
		y: coords.coords.y,
		oasis: tile.oasis
	};
}

function resolve_tile_coordinates(tile: any): { locationId: number; coords: { x: number; y: number } } | null {
	const byId = number_or_null(tile.locationId ?? tile.id);
	if (byId !== null) return { locationId: byId, coords: id2xy(byId) };
	if (tile.x != null && tile.y != null) {
		const x = Number(tile.x);
		const y = Number(tile.y);
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
		return { locationId: xy2id(x, y), coords: { x, y } };
	}
	return null;
}

function number_or_null(value: any): number | null {
	if (value === null || value === undefined || value === '') return null;
	const candidate = Number(value);
	return Number.isFinite(candidate) ? candidate : null;
}

export default new map_scanner();
