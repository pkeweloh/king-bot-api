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
export default class NatureTable extends Component {

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

		const natureLabels = this.props.lang_nature_types;
		const oasisLabels = this.props.lang_oasis_types;

		this.table = jQuery('#table').DataTable({
			dom: 'ritp',
			columnDefs: [
				{ targets: [2], orderable: false }
			],
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
					data: 'oasis_type',
					className: 'dt-center',
					render: type => `<i class="oasis oasis${type}" title="${oasisLabels[type] ?? ''}"></i>`
				},
				{
					data: 'nature',
					render: nature => {
						if (!nature)
							return '';
						const entries = Object.entries(nature);
						const list = entries.map(([nature_type, amount]) => {
							const label = natureLabels[nature_type] ?? '';
							return `
								<li style="display:inline-flex;align-items:center;vertical-align:text-top;">
									<i class="unitSmall nature unitType${nature_type}" title="${label}"></i>
									<span style="padding-left:0.2em;padding-right:0.4em;">${amount}</span>
								</li>
							`;
						}).join('');
						return `<ul style="margin:0;padding:0;list-style:none;">${list}</ul>`;
					}
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
							<th style={ rowCenterStyle }>{this.props.lang_table_oasis}</th>
							<th style={ rowStyle }>{this.props.lang_table_nature}</th>
						</tr>
					</thead>
					<tbody />
				</table>
			</div>
		);
	}
}
