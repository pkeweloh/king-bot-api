import { h, render, Component } from 'preact';
import { route } from 'preact-router';
import classNames from 'classnames';
import axios from 'axios';
import { connect } from 'unistore/preact';
import { storeKeys } from '../language';
import InfoTitle from '../components/info_title';
import { Input, Button } from '../components/form';

@connect(storeKeys)
export default class Settings extends Component {
	state = {
		logzio_enabled: false,
		logzio_host: '',
		logzio_token: '',
		user_agent: '',
		error_logzio_host: false,
		error_logzio_token: false,
		error_user_agent: false
	};

	componentWillMount() {
		axios.post('/api/settings', { action: 'get' }).then(res => {
			const { data } = res.data;
			this.setState({ ...data });
		});
	}

	submit() {
		const { logzio_enabled, logzio_host, logzio_token } = this.state;

		this.setState({
			error_logzio_host: logzio_enabled && !logzio_host,
			error_logzio_token: logzio_enabled && !logzio_token,
			error_user_agent: !this.state.user_agent
		});

		if (this.state.error_logzio_host || this.state.error_logzio_token || this.state.error_user_agent)
			return;

		axios.post('/api/settings', {
			action: 'save',
			logzio_enabled, logzio_host, logzio_token, user_agent: this.state.user_agent
		});
		route('/');
	}

	cancel() {
		route('/');
	}

	render(props, { logzio_enabled, logzio_host, logzio_token }) {
		const input_class_logzio_host = classNames({
			'input': true,
			'is-radiusless': true,
			'is-danger': this.state.error_logzio_host,
		});

		const input_class_logzio_token = classNames({
			'input': true,
			'is-radiusless': true,
			'is-danger': this.state.error_logzio_token,
		});

		return (
			<div>

				<InfoTitle
					title={ props.lang_settings_title }
					description={ props.lang_settings_description }
				/>

				<div class='columns'>

					<div className='column is-half'>

						<div class="field">
							<p class='control'>
								<label class="checkbox is-radiusless">
									<input
										type="checkbox"
										name="logzio_enabled"
										onChange={ e => this.setState({ logzio_enabled: e.target.checked }) }
										checked={ logzio_enabled }
									/> {props.lang_settings_logzio_enabled}
								</label>
							</p>
						</div>

						<Input
							label={ props.lang_settings_logzio_host }
							placeholder='listener.logz.io'
							value={ logzio_host }
							onChange={ e => this.setState({ logzio_host: e.target.value }) }
							className={ input_class_logzio_host }
							icon='fa-cube'
						/>

						<Input
							label={ props.lang_settings_logzio_token }
							placeholder='GwcFiWmxTgedlLRgCjyGNSzNtZEojIhp'
							value={ logzio_token }
							onChange={ e => this.setState({ logzio_token: e.target.value }) }
							className={ input_class_logzio_token }
							icon='fa-cube'
						/>

						<Input
							label='User-Agent'
							placeholder='Mozilla/5.0 ...'
							value={ this.state.user_agent }
							onChange={ e => this.setState({ user_agent: e.target.value }) }
							className={ classNames({ 'input': true, 'is-radiusless': true, 'is-danger': this.state.error_user_agent }) }
							icon='fa-user'
						/>

					</div>

				</div>

				<div className="columns">

					<div className="column">

						<div class="buttons">
							<Button action={ props.lang_button_submit } onClick={ this.submit.bind(this) } className="is-success" icon='fa-check' />
							<Button action={ props.lang_button_cancel } onClick={ this.cancel.bind(this) } icon='fa-times' />
						</div>

					</div>

				</div>

			</div>
		);
	}
}
