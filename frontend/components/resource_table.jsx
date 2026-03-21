import { h, Component } from 'preact';
import { connect } from 'unistore/preact';
import lang, { storeKeys } from '../language';

var jQuery = require( 'jquery' );
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
export default class ResourceTable extends Component {

	table = null;

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
		if (this.table) {
			this.table.destroy();
			this.table = null;
		}
	}

	createTable() {
		if (this.table)
			return;

		const oasisTypes = this.props.lang_oasis_types;

		this.table = jQuery('#table').DataTable({
			dom: 'ritp',
			pageLength: 10,
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
					className: 'dt-center',
					render: row => `<span title="id: ${row.id}">(${row.x}|${row.y})</span>`
				},
				{
					data: 'res_type',
					render: res_type => {
						let oasis_type;
						switch (res_type) {
							case '5436':
							case '5346':
								oasis_type = '10';
								break;
							case '4536':
							case '3546':
								oasis_type = '20';
								break;
							case '4356':
							case '3456':
								oasis_type = '30';
								break;
							default:
								oasis_type = '';
						}
						const label = oasis_type ? ` title="${oasisTypes[oasis_type] ?? ''}"` : '';
						const icon = oasis_type ? `<i class="oasis oasis${oasis_type}"${label}></i>` : '';
						return `
							<div style="display:inline-flex;align-items:center;vertical-align:text-top;">
								${icon}<span style="padding-left:0.2em;padding-right:0.4em;">${res_type}</span>
							</div>
						`;
					}
				},
				{
					data: 'bonus',
					render: bonus => `${bonus}%`
				},
				{
					data: null,
					className: 'dt-center',
					render: row => row.free
						? '<a class="has-text-black"><span class="icon is-medium"><i class="fas fa-lg fa-check"></i></span></a>'
						: `<span style="min-width:2rem;display:inline-block;">${row.player_name ?? '-'}</span>`
				}
			],
			data: this.props.content
		});
	}

	updateTableData(content) {
		if (!this.table)
			return;
		this.table.clear();
		this.table.rows.add(content);
		this.table.page('first').draw(false);
	}

	render() {
		return (
			<div>
				<table id="table" className='table is-hoverable is-fullwidth'>
					<thead>
						<tr>
							<th style={ rowCenterStyle }>{this.props.lang_table_distance}</th>
							<th style={ rowCenterStyle }>{this.props.lang_table_coordinates}</th>
							<th style={ rowStyle }>{this.props.lang_table_type}</th>
							<th style={ rowStyle }>{this.props.lang_table_bonus}</th>
							<th style={ rowCenterStyle }>{this.props.lang_table_free}</th>
						</tr>
					</thead>
					<tbody />
				</table>
			</div>
		);
	}
}
