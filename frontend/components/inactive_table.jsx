import { h, Component } from 'preact';
import { connect } from 'unistore/preact';
import lang, { storeKeys } from '../language';

var jQuery = require('jquery');
import 'datatables.net';
import 'datatables-bulma';

const rowStyle = {
	verticalAlign: 'middle',
	textAlign: 'left',
	whiteSpace: 'nowrap'
};

const rowCenterStyle = {
	verticalAlign: 'middle',
	textAlign: 'center',
};

@connect(storeKeys)
export default class InactiveTable extends Component {

	table = null;
	toggleStates = new Map();
	toggleHandler = null;

	componentDidMount() {
		this.createTable();
	}

	componentWillReceiveProps(nextProps) {
		const revisionChanged = nextProps.data_revision !== this.props.data_revision;
		if (nextProps.content.length !== this.props.content.length || revisionChanged) {
			this.updateTableData(nextProps.content);
		}
	}

	shouldComponentUpdate() {
		return false;
	}

	componentWillUnmount() {
		this.detachToggleHandler();
		if (this.table) {
			this.table.destroy();
			this.table = null;
		}
	}

	createTable() {
		if (this.table)
			return;

		this.table = jQuery('#table').DataTable({
			dom: 'ritp',
			pageLength: 25,
			lengthChange: false,
			language: {
				url: '/i18n/' + lang.currentLanguage + '.json'
			},
			columns: [
				{
					data: 'distance',
					render: distance => Number(distance ?? 0).toFixed(1),
					className: 'dt-center'
				},
				{
					data: null,
					render: row => `(${row.x}|${row.y})`,
					className: 'dt-center'
				},
				{
					data: 'population',
					className: 'dt-center'
				},
				{
					data: 'village_name',
					render: (data, type, row) => row.isMainVillage
						? `
							<span class="icon-text">
								<span class="icon"><i class="fas fa-home"></i></span>
								<span>${data}</span>
							</span>
						`
						: data
				},
				{ data: 'player_name' },
				{
					data: 'tribeId',
					render: tribeId => {
						switch (tribeId) {
							case '1': return lang.translate('lang_tribe_roman');
							case '2': return lang.translate('lang_tribe_teuton');
							case '3': return lang.translate('lang_tribe_gaul');
							default: return '';
						}
					}
				},
				{
					data: 'kingdom_tag',
					className: 'dt-center',
					render: tag => tag || '-'
				},
				{
					data: null,
					orderable: false,
					className: 'dt-center',
					render: row => {
						const toggled = this.toggleStates.get(row.villageId);
						const icon = toggled ? 'fas fa-lg fa-minus' : 'fas fa-lg fa-plus';
						return `
							<a class="has-text-black toggle-action" data-id="${row.villageId}">
								<span class='icon is-medium'>
									<i class='${icon}'></i>
								</span>
							</a>
						`;
					}
				}
			],
			data: this.props.content
		});

		this.attachToggleHandler();
	}

	updateTableData(content) {
		if (!this.table)
			return;
		this.table.clear();
		this.table.rows.add(content);
		this.table.page('first').draw(false);
	}

	attachToggleHandler() {
		if (!this.table)
			return;
		const tbody = jQuery('#table tbody');
		this.toggleHandler = async e => {
			const $tr = jQuery(e.currentTarget).closest('tr');
			const row = this.table.row($tr);
			const data = row.data();
			if (!data || !this.props.clicked)
				return;
			const success = await this.props.clicked(data);
			if (success) {
				const current = this.toggleStates.get(data.villageId) || false;
				this.toggleStates.set(data.villageId, !current);
				row.invalidate().draw(false);
			}
		};
		tbody.on('click', '.toggle-action', this.toggleHandler);
	}

	detachToggleHandler() {
		if (this.toggleHandler) {
			jQuery('#table tbody').off('click', '.toggle-action', this.toggleHandler);
			this.toggleHandler = null;
		}
	}

	render() {
		return (
			<div>
				<table id='table' className='table is-hoverable is-fullwidth'>
					<thead>
						<tr>
							<th style={ rowCenterStyle }>{this.props.lang_table_distance}</th>
							<th style={ rowCenterStyle }>{this.props.lang_table_coordinates}</th>
							<th style={ rowCenterStyle }>{this.props.lang_table_population}</th>
							<th style={ rowStyle }>{this.props.lang_table_village}</th>
							<th style={ rowStyle }>{this.props.lang_table_player}</th>
							<th style={ rowStyle }>{this.props.lang_table_tribe}</th>
							<th style={ rowCenterStyle }>{this.props.lang_table_kingdom}</th>
							<th />
						</tr>
					</thead>
					<tbody />
				</table>
			</div>
		);
	}
}
