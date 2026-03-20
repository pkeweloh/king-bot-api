import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from './logger';
import { xy2id, id2xy, RegionBounds } from './util';
import { Imap_region_tile } from './interfaces';

type region_entries = { [region_id: string]: any };

type RegionTileRow = {
	tileId: number;
	layer: number;
	regionId: number;
	x: number;
	y: number;
	ownerId: number | null;
	playerId: number | null;
	villageId: number | null;
	landscape: string | null;
	resType: string | null;
	payload: string | null;
};

interface NormalizedTile {
	tileId: number;
	layer: number;
	regionId: number;
	x: number;
	y: number;
	ownerId?: number;
	playerId?: number;
	villageId?: number;
	landscape?: string | null;
	resType?: string | null;
	payload: any;
}

class CacheService {
	private db: Database.Database | null = null;
	private is_initialized = false;

	public init() {
		if (this.is_initialized) return;

		try {
			const db_dir = path.join(__dirname, '../assets');
			if (!fs.existsSync(db_dir)) {
				fs.mkdirSync(db_dir, { recursive: true });
			}

			const db_path = path.join(db_dir, 'cache.sqlite');
			this.db = new Database(db_path);

			this.db.pragma('journal_mode = WAL');
			this.db.pragma('synchronous = NORMAL');

			this.create_tables();

			this.is_initialized = true;
			logger.info('cache initialized', 'cache');
		} catch (error: any) {
			logger.error(`failed to initialize cache: ${error.message}`, 'cache');
		}
	}

	private create_tables() {
		if (!this.db) return;

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS Player (
				playerId INTEGER PRIMARY KEY,
				name TEXT,
				tribeId INTEGER,
				kingdomId INTEGER,
				kingdomRole INTEGER,
				population INTEGER,
				villagesCount INTEGER,
				updatedAt INTEGER
			);

			CREATE TABLE IF NOT EXISTS Village (
				villageId INTEGER PRIMARY KEY,
				playerId INTEGER,
				name TEXT,
				x INTEGER,
				y INTEGER,
				isMainVillage INTEGER,
				isCity INTEGER,
				population INTEGER,
				updatedAt INTEGER
			);

			CREATE TABLE IF NOT EXISTS Cache (
				key TEXT PRIMARY KEY,
				value TEXT,
				updatedAt INTEGER
			);

			CREATE TABLE IF NOT EXISTS RegionLayer (
				layer INTEGER,
				regionId INTEGER,
				payload TEXT,
				updatedAt INTEGER,
				PRIMARY KEY (layer, regionId)
			);

			CREATE TABLE IF NOT EXISTS RegionTile (
				tileId INTEGER,
				layer INTEGER,
				regionId INTEGER,
				x INTEGER,
				y INTEGER,
				ownerId INTEGER,
				playerId INTEGER,
				villageId INTEGER,
				landscape TEXT,
				resType TEXT,
				payload TEXT,
				updatedAt INTEGER,
				PRIMARY KEY (tileId, layer)
			);
		`);
	}

	public sync_payload(payload: any) {
		if (!this.db || !payload) return;

		try {
			const items = Array.isArray(payload) ? payload : [payload];

			for (const item of items) {
				this.process_item(item);
			}
		} catch (error: any) {
			logger.error(`error synchronizing payload: ${error.message}`, 'cache');
		}
	}

	private process_item(item: any) {
		if (!item || !item.name) return;

		this.upsert_generic(item.name, item.data);

		if (item.name.startsWith('Player:')) {
			this.upsert_player(item.data);
		} else if (item.name.startsWith('Village:')) {
			this.upsert_village(item.data);
		} else if (item.name.startsWith('Collection:') && item.data?.cache) {
			this.sync_payload(item.data.cache);
		}
	}

	public get(names: string[]): any[] {
		if (!this.db || !names || names.length === 0) return [];

		const placeholders = names.map(() => '?').join(',');
		const stmt = this.db.prepare(`SELECT key, value FROM Cache WHERE key IN (${placeholders})`);
		const rows = stmt.all(...names) as any[];

		const results = rows.map(row => ({
			name: row.key,
			data: JSON.parse(row.value)
		}));

		const missingNames = names.filter(name => !rows.some(row => row.key === name));
		for (const missingName of missingNames) {
			const fallbackData = this.build_map_details_fallback(missingName);
			if (fallbackData) {
				results.push({
					name: missingName,
					data: fallbackData
				});
			}
		}

		return results;
	}

	private upsert_generic(key: string, data: any) {
		if (!this.db || !key || !data) return;

		const stmt = this.db.prepare(`
			INSERT INTO Cache (key, value, updatedAt)
			VALUES (@key, @value, @updatedAt)
			ON CONFLICT(key) DO UPDATE SET
				value = excluded.value,
				updatedAt = excluded.updatedAt
		`);

		stmt.run({
			key,
			value: JSON.stringify(data),
			updatedAt: Date.now()
		});
	}

	private upsert_player(data: any) {
		if (!this.db || !data || !data.playerId) return;

		const stmt = this.db.prepare(`
			INSERT INTO Player (playerId, name, tribeId, kingdomId, kingdomRole, population, villagesCount, updatedAt)
			VALUES (@playerId, @name, @tribeId, @kingdomId, @kingdomRole, @population, @villagesCount, @updatedAt)
			ON CONFLICT(playerId) DO UPDATE SET
				name = excluded.name,
				tribeId = excluded.tribeId,
				kingdomId = excluded.kingdomId,
				kingdomRole = excluded.kingdomRole,
				population = excluded.population,
				villagesCount = excluded.villagesCount,
				updatedAt = excluded.updatedAt
		`);

		stmt.run({
			playerId: Number(data.playerId),
			name: data.name || null,
			tribeId: data.tribeId || null,
			kingdomId: data.kingdomId || null,
			kingdomRole: data.kingdomRole || null,
			population: data.population || null,
			villagesCount: data.villagesCount || null,
			updatedAt: Date.now()
		});
	}

	private upsert_village(data: any) {
		if (!this.db || !data || !data.villageId) return;

		const stmt = this.db.prepare(`
			INSERT INTO Village (villageId, playerId, name, x, y, isMainVillage, isCity, population, updatedAt)
			VALUES (@villageId, @playerId, @name, @x, @y, @isMainVillage, @isCity, @population, @updatedAt)
			ON CONFLICT(villageId) DO UPDATE SET
				playerId = excluded.playerId,
				name = excluded.name,
				x = excluded.x,
				y = excluded.y,
				isMainVillage = excluded.isMainVillage,
				isCity = excluded.isCity,
				population = excluded.population,
				updatedAt = excluded.updatedAt
		`);

		stmt.run({
			villageId: Number(data.villageId),
			playerId: data.playerId ? Number(data.playerId) : null,
			name: data.name || null,
			x: data.coordinates?.x != null ? Number(data.coordinates.x) : null,
			y: data.coordinates?.y != null ? Number(data.coordinates.y) : null,
			isMainVillage: data.isMainVillage ? 1 : 0,
			isCity: data.isCity ? 1 : 0,
			population: data.population || null,
			updatedAt: Date.now()
		});
	}

	private upsert_region_layer(layer: number, region_id: number, data: any) {
		if (!this.db) return;

		const stmt = this.db.prepare(`
			INSERT INTO RegionLayer (layer, regionId, payload, updatedAt)
			VALUES (@layer, @regionId, @payload, @updatedAt)
			ON CONFLICT(layer, regionId) DO UPDATE SET
				payload = excluded.payload,
				updatedAt = excluded.updatedAt
		`);

		stmt.run({
			layer,
			regionId: region_id,
			payload: JSON.stringify(data),
			updatedAt: Date.now()
		});
	}

	private upsert_region_tiles(tiles: NormalizedTile[]) {
		if (!this.db || tiles.length === 0) return;

		const stmt = this.db.prepare(`
			INSERT INTO RegionTile
			(tileId, layer, regionId, x, y, ownerId, playerId, villageId, landscape, resType, payload, updatedAt)
			VALUES
			(@tileId, @layer, @regionId, @x, @y, @ownerId, @playerId, @villageId, @landscape, @resType, @payload, @updatedAt)
			ON CONFLICT(tileId, layer) DO UPDATE SET
				regionId = excluded.regionId,
				x = excluded.x,
				y = excluded.y,
				ownerId = excluded.ownerId,
				playerId = excluded.playerId,
				villageId = excluded.villageId,
				landscape = excluded.landscape,
				resType = excluded.resType,
				payload = excluded.payload,
				updatedAt = excluded.updatedAt
		`);

		const now = Date.now();

		const insert_many = this.db.transaction((rows: NormalizedTile[]) => {
			for (const tile of rows) {
				stmt.run({
					tileId: tile.tileId,
					layer: tile.layer,
					regionId: tile.regionId,
					x: tile.x,
					y: tile.y,
					ownerId: tile.ownerId ?? null,
					playerId: tile.playerId ?? null,
					villageId: tile.villageId ?? null,
					landscape: tile.landscape,
					resType: tile.resType,
					payload: JSON.stringify(tile.payload),
					updatedAt: now
				});
			}
		});

		insert_many(tiles);
	}

	public sync_region_response(response: any) {
		if (!this.db || !response) return;

		try {
			for (const layer_key of Object.keys(response)) {
				const layer_number = Number(layer_key);
				if (Number.isNaN(layer_number)) continue;

				const layer_value = response[layer_key];
				if (!layer_value) continue;

				const entries = this.extract_region_entries(layer_value);
				if (!entries) continue;

				for (const region_id_str of Object.keys(entries)) {
					const region_id = Number(region_id_str);
					if (Number.isNaN(region_id)) continue;

					const region_data = entries[region_id_str];
					if (!region_data) continue;

					this.upsert_region_layer(layer_number, region_id, region_data);

					const tiles = this.normalize_region_tiles(layer_number, region_id, region_data);
					if (tiles.length > 0) {
						this.upsert_region_tiles(tiles);
					}
				}
			}
		} catch (error: any) {
			logger.error(`failed to sync region response: ${error.message}`, 'cache');
		}
	}

	public get_region_last_updated(layer: number, regionId: number): number | null {
		if (!this.db || !Number.isFinite(layer) || !Number.isFinite(regionId)) return null;

		const stmt = this.db.prepare(`
			SELECT updatedAt
			FROM RegionLayer
			WHERE layer = ? AND regionId = ?
			LIMIT 1
		`);
		const row = stmt.get(layer, regionId) as { updatedAt: number } | undefined;
		return row ? row.updatedAt : null;
	}

	public get_tiles_by_region(layer: number, regionId: number): Imap_region_tile[] {
		if (!this.db || !Number.isFinite(layer) || !Number.isFinite(regionId)) {
			return [];
		}

		const sql = `
			SELECT tileId, layer, regionId, x, y, ownerId, playerId, villageId, landscape, resType, payload
			FROM RegionTile
			WHERE layer = ? AND regionId = ?
			ORDER BY x, y
		`;

		return this.map_tile_rows(this.query_region_tiles(sql, [layer, regionId]));
	}

	public get_tiles_in_area(bounds: RegionBounds): Imap_region_tile[] {
		if (!this.db) return [];

		const sql = `
			SELECT tileId, layer, regionId, x, y, ownerId, playerId, villageId, landscape, resType, payload
			FROM RegionTile
			WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?
			ORDER BY layer DESC, x, y
		`;

		return this.map_tile_rows(
			this.query_region_tiles(sql, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY])
		);
	}

	private query_region_tiles(sql: string, params: any[]): RegionTileRow[] {
		if (!this.db) return [];
		const stmt = this.db.prepare(sql);
		const rows = stmt.all(...params) as RegionTileRow[];
		return rows || [];
	}

	private map_tile_rows(rows: RegionTileRow[]): Imap_region_tile[] {
		if (!Array.isArray(rows) || rows.length === 0) {
			return [];
		}

		return rows.map(row => this.map_row_to_region_tile(row));
	}

	private map_row_to_region_tile(row: RegionTileRow): Imap_region_tile {
		const payload = this.parse_tile_payload(row.payload) ?? {};
		const playerId =
			row.playerId ??
			this.safe_number(payload.playerId ?? payload.player ?? payload.owner) ??
			null;
		const villageId =
			row.villageId ??
			this.safe_number(payload.villageId ?? payload.village?.villageId) ??
			null;
		const hasVillage = Boolean(villageId || playerId);
		const type = payload.type ?? payload.village?.type ?? null;
		const resType = row.resType ?? payload.resType ?? payload.landscape ?? null;
		const landscape = row.landscape ?? payload.landscape ?? resType;
		const owner = row.ownerId ?? this.safe_number(payload.owner ?? payload.ownerId) ?? null;

		return {
			...payload,
			id: row.tileId,
			locationId: row.tileId,
			x: row.x,
			y: row.y,
			playerId,
			villageId,
			hasVillage,
			type,
			resType,
			landscape,
			owner,
			village: payload.village ?? null,
			oasis: payload.oasis ?? null
		};
	}

	private extract_region_entries(layer_data: any): region_entries | null {
		if (!layer_data) return null;

		if (layer_data.region && typeof layer_data.region === 'object') {
			return layer_data.region;
		}

		const numeric_entries: region_entries = {};
		for (const key of Object.keys(layer_data)) {
			if (!key) continue;
			const numeric_key = Number(key);
			if (Number.isNaN(numeric_key)) continue;
			numeric_entries[key] = layer_data[key];
		}

		return Object.keys(numeric_entries).length > 0 ? numeric_entries : null;
	}

	private normalize_region_tiles(layer: number, region_id: number, region_value: any): NormalizedTile[] {
		const tiles: NormalizedTile[] = [];
		if (!region_value) return tiles;

		const candidate_array = Array.isArray(region_value) ? region_value : region_value.tiles;
		if (!Array.isArray(candidate_array)) return tiles;

		if (candidate_array.length > 0 && Array.isArray(candidate_array[0]) && Array.isArray(candidate_array[0][0])) {
			const scale = this.get_region_scale(layer);
			const region_origin = id2xy(region_id);
			const region_base_x = region_origin.x * scale;
			const region_base_y = region_origin.y * scale;

			for (let row = 0; row < candidate_array.length; row++) {
				const row_tiles = candidate_array[row];
				if (!Array.isArray(row_tiles)) continue;

				for (let col = 0; col < row_tiles.length; col++) {
					const cell = row_tiles[col];
					if (!cell) continue;

					const x = region_base_x + row;
					const y = region_base_y + col;
					const tile_id = xy2id(x, y);

					tiles.push({
						tileId: tile_id,
						layer,
						regionId: region_id,
						x,
						y,
						ownerId: this.safe_number(cell[1]),
						playerId: this.safe_number(cell[4]) ?? this.safe_number(cell[1]),
						villageId: this.safe_number(cell[4]),
						landscape: this.safe_string(cell[0]),
						resType: this.safe_string(cell[0]),
						payload: cell
					});
				}
			}
		} else {
			for (const tile of candidate_array) {
				if (!tile || typeof tile !== 'object') continue;

				const tile_id = this.get_tile_id_from_data(tile);
				if (!tile_id) continue;

				const coords = id2xy(tile_id);

				tiles.push({
					tileId: tile_id,
					layer,
					regionId: region_id,
					x: coords.x,
					y: coords.y,
					ownerId: this.safe_number(tile.owner ?? tile.playerId),
					playerId: this.safe_number(tile.playerId ?? tile.owner),
					villageId: this.safe_number(tile.village?.villageId ?? tile.villageId),
					landscape: this.safe_string(tile.landscape),
					resType: this.safe_string(tile.resType ?? tile.crop ?? tile.type),
					payload: tile
				});
			}
		}

		return tiles;
	}

	public save_map_data(mapData: any): void {
		if (!this.db || !mapData) return;
		this.upsert_generic('getMapData', mapData);
	}

	public load_map_data(): any | null {
		if (!this.db) return null;
		try {
			const stmt = this.db.prepare(`
				SELECT value
				FROM Cache
				WHERE key = ?
				LIMIT 1
			`);
			const row = stmt.get('getMapData') as { value: string } | undefined;
			if (!row || !row.value) return null;
			return JSON.parse(row.value);
		} catch (error) {
			logger.error(`failed to load map data: ${error}`, 'cache');
			return null;
		}
	}

	private get_tile_id_from_data(tile: any): number {
		if (!tile) return 0;
		const raw_id = tile.id ?? tile.locationId;
		const numeric_id = this.safe_number(raw_id);
		return numeric_id ?? 0;
	}

	private safe_number(value: any): number | null {
		if (value === null || value === undefined || value === '') return null;
		const result = Number(value);
		return Number.isFinite(result) ? result : null;
	}

	private safe_string(value: any): string | null {
		if (value === null || value === undefined) return null;
		return String(value);
	}

	private get_region_scale(layer: number): number {
		if (layer === 3) return 21;
		if (layer === 1) return 7;
		return 7;
	}

	private build_map_details_fallback(name: string): any | null {
		if (!name.startsWith('MapDetails:')) return null;
		const [_, rawId] = name.split(':');
		const tileId = Number(rawId);
		if (!Number.isFinite(tileId)) return null;

		return this.build_map_details_from_tile(tileId);
	}

	private build_map_details_from_tile(tileId: number): any | null {
		const tile = this.fetch_region_tile(tileId);
		if (!tile) return null;

		const payload = tile.payload ?? {};
		const hasVillage = Boolean(
			tile.villageId ||
			payload.hasVillage === '1' ||
			payload.villageId ||
			(payload.village && payload.village.villageId)
		);
		const isOasis = Boolean(payload.isOasis || payload.oasis);
		if (!hasVillage && !isOasis) {
			return null;
		}

		const playerId = tile.playerId ?? payload.playerId ?? 0;
		const villageId = tile.villageId ??
			payload.villageId ??
			(this.safe_number(payload.village?.villageId) ?? 0);

		const resType = tile.resType ?? payload.resType ?? payload.landscape ?? '0';
		const landscape = tile.landscape ?? payload.landscape ?? resType;
		const owner = tile.ownerId ?? payload.owner ?? 0;

		return {
			...payload,
			locationId: tile.tileId,
			x: tile.x,
			y: tile.y,
			playerId,
			villageId,
			hasVillage: hasVillage ? '1' : '0',
			owner,
			resType,
			landscape,
			isOasis,
			oasisType: payload.oasis?.oasisType ?? payload.oasisType ?? '0',
			hasNPC: payload.hasNPC ?? 0,
			isHabitable: payload.isHabitable ?? 0
		};
	}

	private fetch_region_tile(tileId: number): NormalizedTile | null {
		if (!this.db || !Number.isFinite(tileId)) return null;

		const stmt = this.db.prepare(`
			SELECT tileId, layer, regionId, x, y, ownerId, playerId, villageId, landscape, resType, payload
			FROM RegionTile
			WHERE tileId = ?
			ORDER BY layer DESC
			LIMIT 1
		`);
		const row = stmt.get(tileId) as {
			tileId: number;
			layer: number;
			regionId: number;
			x: number;
			y: number;
			ownerId: number | null;
			playerId: number | null;
			villageId: number | null;
			landscape: string | null;
			resType: string | null;
			payload: string | null;
		} | undefined;
		if (!row) return null;

		return {
			tileId: row.tileId,
			layer: row.layer,
			regionId: row.regionId,
			x: row.x,
			y: row.y,
			ownerId: row.ownerId ?? null,
			playerId: row.playerId ?? null,
			villageId: row.villageId ?? null,
			landscape: row.landscape ?? null,
			resType: row.resType ?? null,
			payload: this.parse_tile_payload(row.payload)
		};
	}

	private parse_tile_payload(value: string | null): any | null {
		if (!value) return null;
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}

	public close() {
		if (this.db) {
			this.db.close();
			this.is_initialized = false;
			logger.info('cache closed', 'cache');
		}
	}
}

export default new CacheService();
