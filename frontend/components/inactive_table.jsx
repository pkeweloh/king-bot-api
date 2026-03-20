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

	createTable(options = {}) {
		if (this.table)
			this.table.destroy();

		this.table = jQuery('#table').DataTable({
			dom: 'ritp',
			columnDefs: [{
				targets: 7,
				orderable: false
			}],
			pageLength: 25,
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

	}

	componentDidMount() {
		this.createTable();
	}

	componentDidUpdate(prevProps) {
		const revisionChanged = this.props.data_revision !== prevProps.data_revision;
		if (this.props.content.length !== prevProps.content.length || revisionChanged) {
			const pageFn = this.table && typeof this.table.page === 'function' ? this.table.page() : null;
			const page = pageFn ? pageFn.info().page : 0;
			const order = this.table ? this.table.order() : [];
			this.createTable({ page, order });
		}
	}

	shouldComponentUpdate(nextProps) {
		return this.props.content.length !== nextProps.content.length ||
			this.props.data_revision !== nextProps.data_revision;
	}

	render() {
		const { content, clicked } = this.props;
		const list = content.map(item =>
			<Inactive
				content={ item }
				clicked={ clicked }
			/>
		);

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
					<tbody>{list}</tbody>
				</table>
			</div>
		);
	}
}

class Inactive extends Component {
	state = {
		toggled: false,
	};

	render({ content, clicked, props }, { toggled }) {
		const {
			distance, x, y, population, isMainVillage,
			village_name, player_name, tribeId, kingdom_tag
		} = content;

		const coordinates = `(${x}|${y})`;

		let tribe_name;
		switch (tribeId) {
			case '1': tribe_name = lang.translate('lang_tribe_roman'); break;
			case '2': tribe_name = lang.translate('lang_tribe_teuton'); break;
			case '3': tribe_name = lang.translate('lang_tribe_gaul'); break;
		}

		const icon = toggled ? 'fas fa-lg fa-minus' : 'fas fa-lg fa-plus';

		return (
			<tr>
				<td style={ rowCenterStyle }>
					{ Number(distance).toFixed(1) }
				</td>
				<td style={ rowCenterStyle }>
					{ coordinates }
				</td>
				<td style={ rowCenterStyle }>
					{ population }
				</td>
				<td style={ rowStyle }>
					{ isMainVillage &&
						<span class="icon-text">
							<span class="icon">
								<i class="fas fa-home"></i>
							</span>
							<span>{village_name}</span>
						</span>
					}
					{ !isMainVillage && village_name }
				</td>
				<td style={ rowStyle }>
					{ player_name }
				</td>
				<td style={ rowStyle }>
					{ tribe_name }
				</td>
				<td style={ rowCenterStyle }>
					{ kingdom_tag || '-' }
				</td>
				<td style={ rowStyle }>
					<a class="has-text-black" onClick={ async e => {
						if (await clicked(content)) this.setState({ toggled: !toggled });
					} }>
						<span class='icon is-medium'>
							<i class={ icon }></i>
						</span>
					</a>
				</td>
			</tr>
		);
	}
}
