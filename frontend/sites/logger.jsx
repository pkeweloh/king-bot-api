
import { h, render, Component } from 'preact';
import axios from 'axios';
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
	whiteSpace: 'nowrap'
};

@connect(storeKeys)
export default class Logger extends Component {
	state = {
		log_list: [],
		log_files: [],
		selected_file: 'current'
	};

	async componentDidMount() {
		await this.loadLogs('current');
		await axios.get('/api/data?ident=log_files')
			.then(res => this.setState({ log_files: res.data }));

		this.initDataTable();
	}

	async loadLogs(file) {
		let url = '/api/data?ident=logger';
		if (file !== 'current') {
			url = `/api/data?ident=log_history&file=${file}`;
		}
		const res = await axios.get(url);
		let data = res.data;
		if (file === 'current') {
			data.reverse();
		}
		this.setState({ log_list: data, selected_file: file });
	}

	handleFileChange = async (e) => {
		const file = e.target.value;
		if (jQuery.fn.DataTable.isDataTable('#table')) {
			jQuery('#table').DataTable().destroy();
		}
		await this.loadLogs(file);
		setTimeout(() => this.initDataTable(), 50);
	};

	initDataTable() {
		jQuery('#table').DataTable({
			dom: 'rtip',
			order: [[0, 'desc']],
			pageLength: 10,
			lengthChange: false,
			language: {
				url: '/i18n/' + lang.currentLanguage + '.json'
			}
		});
	}

	shouldComponentUpdate(nextProps, nextState) {
		return this.state.log_list.length !== nextState.log_list.length
			|| this.state.selected_file !== nextState.selected_file
			|| this.state.log_files.length !== nextState.log_files.length;
	}

	render(props, { log_list, log_files, selected_file }) {
		const logs = log_list.map((log, index) => <Log key={ index } log={ log }></Log>);

		return (
			<div>
				<div className="field" style={{ marginBottom: '1rem' }}>
					<label className="label">{props.lang_log_select_file}</label>
					<div className="control">
						<div className="select">
							<select value={ selected_file } onChange={ this.handleFileChange }>
								<option value="current">{props.lang_log_current_session}</option>
								{log_files.map((f, i) => <option key={ i } value={ f }>{f}</option>)}
							</select>
						</div>
					</div>
				</div>
				<table id="table" className='table is-hoverable is-fullwidth'>
					<thead>
						<tr>
							<th style={ rowStyle }>{props.lang_log_timestamp}</th>
							<th style={ rowCenterStyle }>{props.lang_log_level}</th>
							<th style={ rowCenterStyle }>{props.lang_log_group}</th>
							<th style={ rowStyle }>{props.lang_log_message}</th>
						</tr>
					</thead>
					<tbody>
						{logs}
					</tbody>
				</table>
			</div>
		);
	}
}

const Log = ({ log }) => (
	<tr>
		<td style={ rowStyle }>{log.timestamp}</td>
		<td style={ rowCenterStyle }>{log.level}</td>
		<td style={ rowCenterStyle }>{log.group}</td>
		<td style={{ ...rowStyle, whiteSpace: 'normal', maxWidth: '50vw', wordBreak: 'break-all' }}>
			<div style={{ maxHeight: '150px', overflowY: 'auto', overflowX: 'auto', wordBreak: 'break-all', overflowWrap: 'break-word' }}>
				{log.message}
			</div>
		</td>
	</tr>
);
