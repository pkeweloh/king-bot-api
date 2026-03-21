import world_scan_proxy from '../world_scan_proxy';
import { village } from '../gamedata';
import { Inaturefinder, Imap_region_tile, Ivillage } from '../interfaces';
import { get_distance } from '../util';
import { get_oasis_type, resolve_map_details } from './map/helpers';
import { nature_type } from '../data';

class nature_finder {

	async get_nature(
		village_id: number,
		nature_type: nature_type
	): Promise<any> {

		if (!nature_type) {
			return {
				error: true,
				message: 'nature type not been provided.',
				data: null
			};
		}

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

		const tiles = await world_scan_proxy.run();
		const oases = this.discover_oases(tiles);

		const nature: Inaturefinder[] = [];
		for (const cell of oases) {
			if (!cell.locationId)
				continue;

			const map_details = resolve_map_details(cell.locationId);

			if (!map_details)
				continue;

			if (!map_details.isOasis)
				continue;

			const troops: any = map_details.troops?.units;
			if (!troops || Object.keys(troops).length === 0)
				continue;

			if (nature_type && !Object.prototype.hasOwnProperty.call(troops, nature_type))
				continue;

			const tile_distance = get_distance({ x, y }, { x: cell.x, y: cell.y });
			const crop: Inaturefinder = {
				id: cell.locationId,
				x: cell.x,
				y: cell.y,
				oasis_type: map_details.oasisType,
				nature: troops,
				distance: tile_distance
			};

			nature.push(crop);
		}

		// sort by distance, lowest on top
		nature.sort((a, b) => a.distance - b.distance);

		return {
			error: false,
			message: `${nature.length} found`,
			data: nature
		};
	}

	discover_oases(tiles: Imap_region_tile[]): Imap_region_tile[] {
		return tiles.filter(tile => get_oasis_type(tile) !== null);
	}
}

export default new nature_finder();
