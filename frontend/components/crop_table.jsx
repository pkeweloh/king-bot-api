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
export default class CropTable extends Component {

	table = null;

	createTable(options = {}) {
		if (this.table) {
			this.table.destroy();
			this.table = null;
		}
		this.table = jQuery('#table').DataTable({
			dom: 'ritp',
			pageLength: 10,
			lengthChange: false,
			language: {
				url: '/i18n/' + lang.currentLanguage + '.json'
			}
		});
		if (jQuery('table').length > 1)
			jQuery('table')[1].remove();

		if (options.order && options.order.length)
			this.table.order(options.order);
		if (typeof options.page === 'number')
			this.table.page(options.page);
		this.table.draw(false);

	}

	componentDidMount() {
		this.createTable();
	}

	componentDidUpdate(prevProps) {
		if (this.props.content !== prevProps.content) {
			const page = this.table ? this.table.page.info().page : 0;
			const order = this.table ? this.table.order() : [];
			this.createTable({ page, order });
		}
	}

	shouldComponentUpdate(nextProps) {
		return this.props.content !== nextProps.content;
	}

	render(props) {
		const { content } = props;
		const list = content.map(item =>
			<Crop
				content={ item }
				props={ props }
			/>
		);

		return (
			<div>
				<table id="table" className='table is-hoverable is-fullwidth'>
					<thead>
						<tr>
							<th style={ rowCenterStyle }>{props.lang_table_distance}</th>
							<th style={ rowCenterStyle }>{props.lang_table_coordinates}</th>
							<th style={ rowStyle }>{props.lang_table_type}</th>
							<th style={ rowStyle }>{props.lang_table_bonus}</th>
							<th style={ rowCenterStyle }>{props.lang_table_free}</th>
						</tr>
					</thead>
					<tbody>{list}</tbody>
				</table>
			</div>
		);
	}
}

class Crop extends Component {

	render({ content, props }) {
		const {
			id, x, y, bonus, playerId, player_name, distance, free, crop_type
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
				<td style={ rowStyle }>
					{ crop_type }
				</td>
				<td style={ rowStyle }>
					{ bonus }%
				</td>
				<td style={ rowCenterStyle } title={ `playerId: ${playerId}` }>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						{ free ? (
							<a class="has-text-black">
								<span class='icon is-medium'>
									<i class='fas fa-lg fa-check'></i>
								</span>
							</a>
						) : (
							<span style={{ minWidth: '2rem', display: 'inline-block' }}>
								{ player_name ?? '-' }
							</span>
						) }
					</div>
				</td>
			</tr>
		);
	}
}
