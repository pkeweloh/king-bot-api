import { h, render, Component } from 'preact';
import axios from 'axios';
import classNames from 'classnames';
import { connect } from 'unistore/preact';
import { storeKeys } from '../language';
import { handle_response } from '../actions';
import CropTable from '../components/crop_table';
import InfoTitle from '../components/info_title';
import { Select, Button, Help } from '../components/form';
import { load_map_cache_status, seed_map_cache } from '../services/map_cache';
import TableStatusLayer from '../components/table_status_layer';

@connect(`notifications,${storeKeys}`, handle_response)
export default class CropFinder extends Component {
	state = {
		village_name: '',
		village_id: 0,
		all_villages: [],
		find_15c: true,
		find_9c: true,
		find_7c: true,
		only_free: false,
		crops: [],
		error_village: false,
		loading: false,
		message: '',
		status_message: '',
		cache_seeded: false,
		cache_seeded_at: null,
		cache_seeding: false,
		cache_map_data_cells: 0,
		cache_map_data_regions: { layer1: 0, layer3: 0 },
	};

	componentDidMount() {
		axios.get('/api/data?ident=villages').then(res => {
			this.setState({
				all_villages: res.data,
				village_id: res.data[0].villageId,
				village_name: res.data[0].data.name,
			});
		});
		this.refresh_cache_status();
	}

	refresh_cache_status = async () => {
		try {
			const status = await load_map_cache_status();
			this.setState({
				cache_seeded: Boolean(status.last_seeded_at),
				cache_seeded_at: status.last_seeded_at,
				cache_map_data_cells: status.map_data_cells ?? 0,
				cache_map_data_regions: status.map_data_regions ?? { layer1: 0, layer3: 0 }
			});
		} catch (error) {
			this.setState({
				cache_seeded: false,
				cache_seeded_at: null
			});
		}
	};

	handle_seed_cache = async () => {
		if (this.state.cache_seeding) return;

		this.setState({ cache_seeding: true });
		try {
			const stats = await seed_map_cache();
			this.setState({
				cache_seeded: Boolean(stats?.last_seeded_at),
				cache_seeded_at: stats?.last_seeded_at ?? null,
				cache_map_data_cells: stats?.map_data_cells ?? 0,
				cache_map_data_regions: stats?.map_data_regions ?? { layer1: 0, layer3: 0 }
			});
		} catch (error) {
			this.props.handle_response(
				error?.error ? error : {
					error: true,
					message: this.props.lang_map_cache_seed_error
				}
			);
		} finally {
			this.setState({ cache_seeding: false });
		}
	};


	async search() {
		if (this.state.loading) return;

		if (!this.state.cache_seeded) {
			this.props.handle_response({
				error: true,
				message: this.props.lang_map_cache_seed_required
			});
			return;
		}

		this.setState({
			error_village: (!this.state.village_id)
		});

		if (this.state.error_village) return;

		this.setState({ loading: true, message: '', crops: [], status_message: this.props.lang_table_searching });

		const {
			village_id,
			find_15c,
			find_9c,
			find_7c,
			only_free
		} = this.state;

		const payload_data = {
			village_id,
			find_15c,
			find_9c,
			find_7c,
			only_free
		};

		const payload = {
			action: 'get',
			data: payload_data,
		};

		let response = await axios.post('/api/cropfinder', payload);

		const { error, data } = response.data;

		if (error) {
			this.setState({ loading: false, status_message: '' });
			this.props.handle_response(data);
			return;
		}

		const tableMessage = data.length ? '' : this.props.lang_table_no_results;
		this.setState({ crops: [ ...data ], loading: false, status_message: tableMessage });
	}

	set_crop_type = e => {
		const { name, checked } = e.target;
		let { find_15c, find_9c, find_7c } = this.state;
		switch (name) {
			case 'find_15c':
				find_15c = checked;
				if (!find_9c && !find_7c)
					find_9c = true;
				break;
			case 'find_9c':
				find_9c = checked;
				if (!find_15c && !find_7c)
					find_7c = true;
				break;
			case 'find_7c':
				find_7c = checked;
				if (!find_15c && !find_9c)
					find_15c = true;
				break;
		}
		this.setState({ find_15c, find_9c, find_7c });
	};

	render(props, {
		village_id,
		find_15c,
		find_9c,
		find_7c,
		all_villages,
		crops,
		loading,
		cache_seeded,
		cache_seeded_at,
		cache_seeding,
		status_message,
		cache_map_data_cells,
		cache_map_data_regions,
	}) {
		const village_select_class = classNames({
			select: true,
			'is-danger': this.state.error_village,
		});

		const search_button = classNames({
			button: true,
			'is-success': true,
			'is-radiusless': true,
			'is-loading': loading,
		});

		const cache_seed_button_class = classNames({
			'is-info': true,
			'is-radiusless': true,
			'is-loading': cache_seeding
		});

		const cacheInfoText = cache_seeded_at ?
			`${props.lang_map_cache_seeded_at}: ${new Date(cache_seeded_at).toLocaleString()}` :
			props.lang_map_cache_seed_not_triggered;
		const layer1_regions = cache_map_data_regions.layer1 ?? 0;
		const layer3_regions = cache_map_data_regions.layer3 ?? 0;
		const cacheStatsText = cache_seeded_at ?
			`${props.lang_map_cache_cells}: ${cache_map_data_cells} · ${props.lang_map_cache_regions}: L1=${layer1_regions} L3=${layer3_regions}` :
			'';
		const helpTextStyle = { whiteSpace: 'nowrap' };

		const villages = all_villages.map(village =>
			<option
				value={ village.data.villageId }
				village_name={ village.data.name }
			>
				({village.data.coordinates.x}|{village.data.coordinates.y}) {village.data.name}
			</option>
		);

		return (
			<div>
				<InfoTitle
					title={ props.lang_cropfinder_name }
					description={ props.lang_cropfinder_description }
				/>

				<div className='columns is-mobile is-vcentered'>

					<div className='column'>

						<Select
							label = { props.lang_cropfinder_distance_to }
							value = { village_id }
							onChange = { e => this.setState({
								village_name: e.target[e.target.selectedIndex].attributes.village_name.value,
								village_id: e.target.value,
							}) }
							options = { villages }
							className = { village_select_class }
							icon='fa-home'
						/>

						<Button
							action = { props.lang_button_search }
							className = { search_button }
							onClick = { this.search.bind(this) }
							style = {{ marginRight: '1rem' }}
							icon = 'fa-search'
							disabled = { loading || cache_seeding || !cache_seeded }
							title = { !cache_seeded ? props.lang_map_cache_seed_required : '' }
						/>

					</div>

					<div className='column'>

						<div class="field">
							<label class="label">{ props.lang_cropfinder_type }</label>
							<p class='control'>
								<label class='radio is-radiusless'>
									<input
										type = "checkbox"
										name = "find_15c"
										onChange = { this.set_crop_type }
										checked = { find_15c }
									/> 15c
								</label>
								<label class='radio is-radiusless'>
									<input
										type = "checkbox"
										name = "find_9c"
										onChange = { this.set_crop_type }
										checked = { find_9c }
									/> 9c
								</label>
								<label class='radio is-radiusless'>
									<input
										type = "checkbox"
										name = "find_7c"
										onChange = { this.set_crop_type }
										checked = { find_7c }
									/> 7c
								</label>
							</p>
						</div>

						<div class="field">
							<p class='control'>
								<label class="checkbox is-radiusless">
									<input
										type = "checkbox"
										name = "only_free"
										onChange = { e => this.setState({ only_free: e.target.checked }) }
									/> { props.lang_cropfinder_only_free }
								</label>
							</p>
						</div>

					</div>

					<div className='column has-text-right is-vcentered'>
						<Button
							action={ props.lang_map_cache_seed_button }
							className={ cache_seed_button_class }
							onClick={ this.handle_seed_cache }
							icon='fa-sync'
							disabled={ cache_seeding }
						/>
						<Help className='help is-small' content={ cacheInfoText } style={ helpTextStyle } />
						{ cacheStatsText && (
							<Help className='help is-small' content={ cacheStatsText } style={ helpTextStyle } />
						) }
					</div>

				</div>

				<div style={{ position: 'relative' }}>
					<TableStatusLayer
						message={ status_message }
						searching={ status_message === props.lang_table_searching }
						onClose={ () => this.setState({ status_message: '' }) }
					/>
					<CropTable
						content={ crops }
					/>
				</div>

			</div>
		);
	}
}
