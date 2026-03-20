import { h, render, Component } from 'preact';
import axios from 'axios';
import classNames from 'classnames';
import { connect } from 'unistore/preact';
import { storeKeys } from '../language';
import { handle_response } from '../actions';
import InactiveTable from '../components/inactive_table';
import InfoTitle from '../components/info_title';
import { DoubleInput, Select, Button } from '../components/form';
import TableStatusLayer from '../components/table_status_layer';

@connect(`notifications,${storeKeys}`, handle_response)
export default class InactiveFinder extends Component {
	state = {
		selected_farmlist: '',
		village_name: '',
		village_id: 0,
		all_farmlists: [],
		all_villages: [],
		min_player_pop: '',
		max_player_pop: '',
		min_village_pop: '',
		max_village_pop: '',
		min_distance: '',
		max_distance: '',
		inactive_for: '',
		inactives: [],
		error_village: false,
		error_farmlist: false,
		loading: false,
		message: '',
		status_message: '',
		data_revision: 0,
	};

	componentDidMount() {
		axios.get('/api/data?ident=villages').then(res => {
			this.setState({
				all_villages: res.data,
				village_id: res.data[0].villageId,
				village_name: res.data[0].data.name,
			});
		});

		axios.get('/api/data?ident=farmlists')
			.then(res => this.setState({ all_farmlists: res.data }));
	}

	async clicked(item) {
		const { selected_farmlist } = this.state;

		this.setState({
			error_farmlist: (selected_farmlist == '')
		});

		if (this.state.error_farmlist) return false;

		this.setState({ error_farmlist: false });

		const payload = {
			action: 'toggle',
			data: {
				farmlist: selected_farmlist,
				village: item,
			},
		};

		let response = await axios.post('/api/inactivefinder', payload);

		const { error } = response.data;

		if (error) {
			this.props.handle_response(response.data);
			return false;
		}

		return true;
	}

	async search() {
		if (this.state.loading) return;

		this.setState({
			error_village: (!this.state.village_id)
		});

		if (this.state.error_village) return;

		this.setState({ loading: true, message: '', inactives: [], status_message: this.props.lang_table_searching });

		const {
			selected_farmlist,
			village_id,
			min_player_pop,
			max_player_pop,
			min_village_pop,
			max_village_pop,
			min_distance,
			max_distance,
			inactive_for
		} = this.state;

		const payload_data = {
			selected_farmlist,
			village_id,
			min_distance,
			max_distance,
			min_player_pop,
			max_player_pop,
			min_village_pop,
			max_village_pop,
			inactive_for
		};

		const payload = {
			action: 'get',
			data: payload_data,
		};

		let response = await axios.post('/api/inactivefinder', payload);

		const { error, data, message } = response.data;

		if (error) {
			this.setState({ loading: false, status_message: '' });
			this.props.handle_response(response.data);
			return;
		}
		else {
			const tableMessage = data.length ? '' : this.props.lang_table_no_results;
			this.setState({ inactives: [ ...data ], loading: false, status_message: tableMessage, data_revision: Date.now() });
		}

		this.setState({ message });
	}

	render(props, {
		selected_farmlist, village_id,
		all_villages, all_farmlists,
		min_player_pop, max_player_pop,
		min_village_pop, max_village_pop,
		min_distance, max_distance,
		inactive_for, inactives, loading, message,
		status_message,
		data_revision
	}) {
		const village_select_class = classNames({
			select: true,
			'is-danger': this.state.error_village,
		});

		const farmlist_select_class = classNames({
			select: true,
			'is-danger': this.state.error_farmlist,
		});

		const search_button = classNames({
			button: true,
			'is-success': true,
			'is-radiusless': true,
			'is-loading': loading,
		});

		const villages = all_villages.map(village =>
			<option
				value={ village.data.villageId }
				village_name={ village.data.name }
			>
				({village.data.coordinates.x}|{village.data.coordinates.y}) {village.data.name}
			</option>
		);

		const farmlist_opt = all_farmlists.map(farmlist =>
			<option value={ farmlist.data.listName }>
				{ farmlist.data.listName }
			</option>
		);

		return (
			<div>
				<InfoTitle
					title={ props.lang_inactivefinder_name }
					description={ props.lang_inactivefinder_description }
				/>

				<div className='columns'>

					<div className='column'>

						<Select
							label = { props.lang_inactivefinder_distance_to }
							value = { village_id }
							onChange = { e => this.setState({
								village_name: e.target[e.target.selectedIndex].attributes.village_name.value,
								village_id: e.target.value,
							}) }
							options = { villages }
							className = { village_select_class }
							icon='fa-home'
						/>

						<DoubleInput
							label = { props.lang_inactivefinder_player_pop }
							placeholder1 = { props.lang_inactivefinder_default + ': 0' }
							placeholder2 = { props.lang_inactivefinder_default + ': 500' }
							value1 = { min_player_pop }
							value2 = { max_player_pop }
							onChange1 = { e => this.setState({ min_player_pop: e.target.value }) }
							onChange2 = { e => this.setState({ max_player_pop: e.target.value }) }
							icon = 'fa-users-crown'
						/>

						<DoubleInput
							label = { props.lang_inactivefinder_village_pop }
							placeholder1 = { props.lang_inactivefinder_default + ': 0' }
							placeholder2 = { props.lang_inactivefinder_default + ': 200' }
							value1 = { min_village_pop }
							value2 = { max_village_pop }
							onChange1 = { e  => this.setState({ min_village_pop: e.target.value }) }
							onChange2 = { e => this.setState({ max_village_pop: e.target.value }) }
							icon = 'fa-house-user'
						/>

						<Button
							action = { props.lang_button_search }
							className = { search_button }
							onClick = { this.search.bind(this) }
							style = {{ marginRight: '1rem' }}
							icon = 'fa-search'
							disabled = { loading }
						/>

					</div>

					<div className='column'>

						<Select
							label = { props.lang_inactivefinder_add_list }
							value = { selected_farmlist }
							onChange = { e => this.setState({ selected_farmlist: e.target.value }) }
							options = { farmlist_opt }
							className = { farmlist_select_class }
							icon = 'fa-cow'
						/>

						<DoubleInput
							label={ props.lang_inactivefinder_distance }
							placeholder1={ props.lang_inactivefinder_default + ': 0' }
							placeholder2={ props.lang_inactivefinder_default + ': 100' }
							value1={ min_distance }
							value2={ max_distance }
							onChange1={ e => this.setState({ min_distance: e.target.value }) }
							onChange2={ e => this.setState({ max_distance: e.target.value }) }
							icon = 'fa-ruler-horizontal'
						/>

						<label class='label'>{props.lang_inactivefinder_inactive_for}</label>
						<div class='field has-addons'>
							<p class='control has-icons-left'>
								<input
									class='input is-radiusless'
									type='text'
									placeholder={ props.lang_inactivefinder_default + ': 5' }
									value={ inactive_for }
									onChange={ e => this.setState({ inactive_for: e.target.value }) }
									style = {{ width: '11.95em' }}
								/>
								<span class="icon is-left"><i class="fas fa-user-slash"></i></span>
							</p>
							<p class='control'>
								<a class='button is-static is-radiusless'>
									{props.lang_inactivefinder_days}
								</a>
							</p>
						</div>

						<div className='content' style={{ marginTop: '1.5rem' }}>
							{ message }
						</div>

					</div>

				</div>

				<div style={{ position: 'relative' }}>
					<TableStatusLayer
						message={ status_message }
						searching={ status_message === props.lang_table_searching }
						onClose={ () => this.setState({ status_message: '' }) }
					/>
					<InactiveTable
						content={ inactives }
						clicked={ this.clicked.bind(this) }
						data_revision={ data_revision }
					/>
				</div>

			</div>
		);
	}
}
