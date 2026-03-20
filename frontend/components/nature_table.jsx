import { h, render, Component } from 'preact';
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

	createTable() {
		if (this.table)
			this.table.destroy();
		this.table = jQuery('#table').DataTable({
			dom: 'ritp',
			columnDefs: [
				{ targets: [2], orderable: false }
			],
			pageLength: 10,
			lengthChange: false,
			language: {
				url: '/i18n/' + lang.currentLanguage + '.json'
			}
		});
		if (jQuery('table').length > 1)
			jQuery('table')[1].remove();

	}

	componentDidMount() {
		this.createTable();
	}

	componentDidUpdate(prevProps) {
		if (this.props.content.length !== prevProps.content.length)
			this.createTable();
	}

	shouldComponentUpdate(nextProps) {
		return this.props.content.length !== nextProps.content.length;
	}

	render(props) {
		const { content } = props;
		const list = content.map(item => <Nature content={ item } props={ props } />);

		return (
			<div>
				<table id="table" className='table is-hoverable is-fullwidth'>
					<thead>
						<tr>
							<th style={ rowCenterStyle }>{props.lang_table_distance}</th>
							<th style={ rowCenterStyle }>{props.lang_table_coordinates}</th>
							<th style={ rowCenterStyle }>{props.lang_table_oasis}</th>
							<th style={ rowStyle }>{props.lang_table_nature}</th>
						</tr>
					</thead>
					<tbody>{list}</tbody>
				</table>
			</div>
		);
	}
}

class Nature extends Component {

	render({ content, props }) {
		const {
			id, x, y, oasis_type, nature, distance
		} = content;

		const coordinates = `(${x}|${y})`;

		return (
			<tr>
				<td style={ rowCenterStyle }>
					{ Number(distance).toFixed(1) }
				</td>
				<td style={ rowCenterStyle } title={ `id: ${id}` }>
					{ coordinates }
				</td>
				<td style={ rowCenterStyle }>
					<i class={ `oasis oasis${oasis_type}` } title={ props.lang_oasis_types[oasis_type] }></i>
				</td>
				<td style={ rowStyle }>
					{
						<ul>
							{ Object.entries(nature).map(([nature_type, amount]) => {
								return (
									<li style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'text-top' }}>
										<i
											class={ 'unitSmall nature unitType' + nature_type }
											title={ props.lang_nature_types[nature_type] }>
										</i>
										<span style={{ paddingLeft: '0.2em', paddingRight: '0.4em' }}>{ amount }</span>
									</li>
								);
							}) }
						</ul>
					}
				</td>
			</tr>
		);
	}
}
