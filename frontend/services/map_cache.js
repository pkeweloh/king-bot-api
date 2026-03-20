import axios from 'axios';

export async function load_map_cache_status() {
	const response = await axios.get('/api/map_cache/status');
	return {
		last_seeded_at: response.data?.last_seeded_at ?? null,
		map_data_updated_at: response.data?.map_data_updated_at ?? null,
		map_data_radius: response.data?.map_data_radius ?? null,
		map_data_cells: response.data?.map_data_cells ?? 0,
		map_data_regions: response.data?.map_data_regions ?? { layer1: 0, layer3: 0 }
	};
}

export async function seed_map_cache() {
	const response = await axios.post('/api/map_cache/seed', {});
	if (response.data?.error) {
		throw response.data;
	}
	return response.data;
}
