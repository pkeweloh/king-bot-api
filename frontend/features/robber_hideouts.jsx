import { h, render, Component } from 'preact';
import { route } from 'preact-router';
import axios from 'axios';
import classNames from 'classnames';
import { connect } from 'unistore/preact';
import lang, { storeKeys } from '../language';
import { DoubleInput, Select, Button, Help } from '../components/form';
import UnitsTable from '../components/units_table';

@connect(storeKeys)
export default class RoberHideouts extends Component {
	state = {
		all_villages: [],
		units: [],
		village_name: null,
		village_id: 0,
		interval_min: 0,
		interval_max: 0,
		t1: 0,
		t2: 0,
		t3: 0,
		t4: 0,
		t5: 0,
		t6: 0,
		t7: 0,
		t8: 0,
		t9: 0,
		t10: 0,
		t11: 0,
		mission_type: 0,
		mission_type_name: null,
		error_village: false,
		error_interval_min: false,
		error_interval_max: false,
		error_mission_type: false,
		error_units: false
	};

	componentWillMount() {
		this.setState({
			...this.props.feature
		});
	}

	componentDidMount() {
		if (this.state.village_id) {
			this.set_units();
		}

		axios.get('/api/data?ident=villages').then(res => this.setState({ all_villages: res.data }));
	}

	submit = async e => {
		const unit_count =
			Number(this.state.t1 == -1 ? 1 : this.state.t1) +
			Number(this.state.t2 == -1 ? 1 : this.state.t2) +
			Number(this.state.t3 == -1 ? 1 : this.state.t3) +
			Number(this.state.t4 == -1 ? 1 : this.state.t4) +
			Number(this.state.t5 == -1 ? 1 : this.state.t5) +
			Number(this.state.t6 == -1 ? 1 : this.state.t6) +
			Number(this.state.t7 == -1 ? 1 : this.state.t7) +
			Number(this.state.t8 == -1 ? 1 : this.state.t8) +
			Number(this.state.t9 == -1 ? 1 : this.state.t9) +
			Number(this.state.t10 == -1 ? 1 : this.state.t10) +
			Number(this.state.t11);

		this.setState({
			error_village: this.state.village_id == 0,
			error_interval_min: this.state.interval_min == 0,
			error_interval_max: this.state.interval_max == 0,
			error_mission_type: this.state.mission_type == 0,
			error_units: isNaN(unit_count) || unit_count == 0
		});

		if (this.state.error_village || this.state.error_mission_type ||
			this.state.error_interval_min || this.state.error_interval_max ||
			this.state.error_units) return;

		if (!this.can_siege() && this.state.mission_type == 47) {
			this.setState({ mission_type: 3, mission_type_name: 'Attack' });
		}

		this.props.submit({ ...this.state });
	};

	delete = async e => {
		this.props.delete({ ...this.state });
	};

	cancel = async e => {
		route('/');
	};

	set_units = async e => {
		const { village_id } = this.state;
		const response = await axios.get(`/api/data?ident=units&village_id=${village_id}`);
		let units = [];
		if (response.data != null) {
			units = response.data;
		}
		this.setState({ units });
	};

	add_unit = async e => {
		if (!e.target)
			return;
		switch (e.target.id) {
			case 't1': this.setState({ t1: e.target.text }); break;
			case 't2': this.setState({ t2: e.target.text }); break;
			case 't3': this.setState({ t3: e.target.text }); break;
			case 't4': this.setState({ t4: e.target.text }); break;
			case 't5': this.setState({ t5: e.target.text }); break;
			case 't6': this.setState({ t6: e.target.text }); break;
			case 't7': this.setState({ t7: e.target.text }); break;
			case 't8': this.setState({ t8: e.target.text }); break;
			case 't9': this.setState({ t9: e.target.text }); break;
			case 't10': this.setState({ t10: e.target.text }); break;
			case 't11': this.setState({ t11: e.target.text }); break;
		}
	};

	set_unit = async e => {
		if (!e.target)
			return;
		switch (e.target.name) {
			case 't1': this.setState({ t1: e.target.value }); break;
			case 't2': this.setState({ t2: e.target.value }); break;
			case 't3': this.setState({ t3: e.target.value }); break;
			case 't4': this.setState({ t4: e.target.value }); break;
			case 't5': this.setState({ t5: e.target.value }); break;
			case 't6': this.setState({ t6: e.target.value }); break;
			case 't7': this.setState({ t7: e.target.value }); break;
			case 't8': this.setState({ t8: e.target.value }); break;
			case 't9': this.setState({ t9: e.target.value }); break;
			case 't10': this.setState({ t10: e.target.value }); break;
			case 't11': this.setState({ t11: e.target.checked ? 1 : 0 }); break;
		}
	};

	can_siege() {
		var { units } = this.state;
		var { t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11 } = this.state;

		// all units support
		if (t1 == -1)
			t1 = units[1];
		if (t2 == -1)
			t2 = units[2];
		if (t3 == -1)
			t3 = units[3];
		if (t4 == -1)
			t4 = units[4];
		if (t5 == -1)
			t5 = units[5];
		if (t6 == -1)
			t6 = units[6];
		if (t7 == -1)
			t7 = units[7];
		if (t8 == -1)
			t8 = units[8];

		var amount =
			Number(t1) + Number(t2) + Number(t3) +
			Number(t4) + Number(t5) + Number(t6) +
			Number(t7) + Number(t8) + Number(t9) +
			Number(t10) + Number(t11);

		return t7 > 0 && amount >= 1000;
	}

	render(props) {
		var { all_villages, units,
			interval_min, interval_max,
			village_id, mission_type,
			t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11
		} = this.state;

		const input_class_min = classNames({
			input: true,
			'is-radiusless': true,
			'is-danger': this.state.error_interval_min,
		});

		const input_class_max = classNames({
			input: true,
			'is-radiusless': true,
			'is-danger': this.state.error_interval_max,
		});

		const village_select_class = classNames({
			select: true,
			'is-danger': this.state.error_village
		});

		const missiontype_select_class = classNames({
			select: true,
			'is-danger': this.state.error_mission_type
		});

		const villages = all_villages.map(village =>
			<option
				value={ village.data.villageId }
				village_name={ village.data.name }
			>
				({village.data.coordinates.x}|{village.data.coordinates.y}) {village.data.name}
			</option>
		);

		const can_siege = this.can_siege();
		if (!can_siege && mission_type == 47) {
			mission_type = 3;
		}
		const mission_types = [
			{ value: 3, name: props.lang_mission_type_attack },
			{ value: 4, name: props.lang_mission_type_raid },
			{ value: 47, name: props.lang_mission_type_siege, disabled: !can_siege }
		].map(option =>
			<option
				value={ option.value }
				mission_type_name={ option.name }
				disabled = { option.disabled }
			>
				{option.name}
			</option>
		);

		return (
			<div>
				<div className="columns">

					<div className="column">

						<DoubleInput
							label = { props.lang_common_interval }
							placeholder1 = { props.lang_common_min }
							placeholder2 = { props.lang_common_max }
							value1 = { interval_min }
							value2 = { interval_max }
							onChange1 = { e => this.setState({ interval_min: e.target.value }) }
							onChange2 = { e => this.setState({ interval_max: e.target.value }) }
							class1 = { input_class_min }
							class2 = { input_class_max }
							icon = 'fa-stopwatch'
						/>

					</div>

					<div className="column">

						<Select
							label = { props.lang_combo_box_village }
							value = { village_id }
							onChange = { e => {
								this.setState({
									village_name: e.target[e.target.selectedIndex].attributes.village_name.value,
									village_id: e.target.value
								});
								this.set_units();
							} }
							options = { villages }
							className = { village_select_class }
							icon='fa-home'
						/>

						<Select
							label = { props.lang_combo_box_missiontype }
							value = { mission_type }
							onChange = { e => this.setState({
								mission_type_name: e.target[e.target.selectedIndex].attributes.mission_type_name.value,
								mission_type: e.target.value
							}) }
							options = { mission_types }
							className = { missiontype_select_class }
							icon = 'fa-bullseye-arrow'
						/>

					</div>

				</div>

				<div class="columns">

					<div class="column">

						<UnitsTable
							units = { units }
							error_units = { this.state.error_units }
							t1 = { t1 }
							t2 = { t2 }
							t3 = { t3 }
							t4 = { t4 }
							t5 = { t5 }
							t6 = { t6 }
							t7 = { t7 }
							t8 = { t8 }
							t9 = { t9 }
							t10 = { t10 }
							t11 = { t11 }
							clicked={ this.add_unit }
							changed={ this.set_unit }
						/>

					</div>

				</div>

				<div className="columns">

					<div className="column">

						<div class="buttons">
							<Button action={ props.lang_button_submit } onClick={ this.submit } className="is-success" icon='fa-check' />
							<Button action={ props.lang_button_cancel } onClick={ this.cancel } icon='fa-times' />
							<Button action={ props.lang_button_delete } onClick={ this.delete } className="is-danger" icon='fa-trash-alt' />
						</div>

					</div>

					<div className="column">
					</div>

				</div>

			</div>
		);
	}
}
