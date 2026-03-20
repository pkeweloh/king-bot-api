import { h, render, Component } from 'preact';
import axios from 'axios';
import classNames from 'classnames';
import { connect } from 'unistore/preact';
import { storeKeys } from '../frontend/language';
import { Input, Button } from '../frontend/components/form';

const version = '1.3.9';

@connect(storeKeys)
class Login extends Component {
	state = {
		gameworld: '',
		email: '',
		password: '',
		sitter_type: '',
		sitter_name: '',
		sitter_style: null,
		settings: null,
		start_style: null,
		start_loading: false,
		login_style: null,
		login_loading: false,
		show_info: false,
		error_gameworld: false,
		error_email: false,
		error_password: false,
		error_sitter: false
	};

	async componentDidMount() {
		let { settings, start_style, login_style } = this.state;
		await axios.get('/api/settings').then(({ data }) => settings = data );
		start_style = { display: 'none' };
		login_style = {};
		if (settings && settings.email) {
			start_style = { marginBottom: '1em' };
			login_style = { display: 'none' };
		}
		this.setState({ settings, start_style, login_style });
	}

	set_sitter(sitter_type) {
		var sitter_style = {};
		if (sitter_type == '')
			sitter_style = { display: 'none' };
		this.setState({ sitter_type, sitter_style });
	}

	toggle_login = _ => {
		const { login_style } = this.state;
		this.setState({
			login_style: Object.keys(login_style).length === 0 ? { display: 'none' } : {}
		});
	};

	start = _ => {
		this.setState({
			start_loading: true,
			show_info: true,
			login_style: { display: 'none' }
		});
		setTimeout(async e => {
			fetch('/api/start', {
				method: 'GET'
			});
		}, 2000 );
	};

	submit = _ => {
		const { gameworld, email, password, sitter_type, sitter_name } = this.state;

		this.setState({
			error_gameworld: !gameworld,
			error_email: !email,
			error_password: !password,
			error_sitter: sitter_type != '' && !sitter_name
		});

		const {
			error_gameworld, error_email, error_password, error_sitter } = this.state;

		if (error_gameworld || error_email || error_password || error_sitter) return;

		this.setState({ login_loading: true });

		fetch('/api/login', {
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				gameworld,
				email,
				password,
				sitter_type,
				sitter_name
			})
		});
	};

	replaceJSX(str, find, replace) {
		let parts = str.split(find);
		let result = [];
		for (let i = 0; i < parts.length; i++) {
			result.push(parts[i]);
			if (i < parts.length - 1)
				result.push(replace);
		}
		return result;
	}

	render(props, {
		gameworld,
		email,
		password,
		sitter_type,
		sitter_name,
		sitter_style,
		settings,
		start_style,
		start_loading,
		login_style,
		login_loading,
		show_info,
		error_gameworld,
		error_email,
		error_password,
		error_sitter,
	}) {

		const input_class_gameworld = classNames({
			'input': true,
			'is-radiusless': true,
			'is-danger': error_gameworld,
		});

		const input_class_email = classNames({
			'input': true,
			'is-radiusless': true,
			'is-danger': error_email,
		});

		const input_class_password = classNames({
			'input': true,
			'is-radiusless': true,
			'is-danger': error_password,
		});

		const input_class_sitter = classNames({
			'input': true,
			'is-radiusless': true,
			'is-danger': error_sitter,
		});

		const button_class_start = classNames({
			'button': true,
			'is-radiusless': true,
			'is-success': true,
			'is-medium': true,
			'is-loading': start_loading
		});

		const button_class_login = classNames({
			'button': true,
			'is-radiusless': true,
			'is-success': true,
			'is-loading': login_loading
		});

		const sitter_types = [ '',
			props.lang_login_type_sitter,
			props.lang_login_type_dual
		].map(option =>
			<option	value={ option }>{option}</option>
		);

		const connection_info = settings ?
			<span><b>{settings.gameworld}{settings.avatar_name ? '/' + settings.avatar_name : ''}</b> (<b>{settings.email}</b>)</span>
			: null;
		const help_relogin = this.replaceJSX(
			props.lang_login_relogin,
			'%',
			<a href="#login" onClick = { this.toggle_login }>{ props.lang_login_relogin_button }</a>
		);

		return (
			<div class="container" style={{ marginTop: '6rem' }}>
				<div class='notification is-radiusless is-info' style={ show_info ? {} : { display: 'none' } }>
					{props.lang_login_info}
				</div>
				<div class="columns is-centered">

					<div className="column is-half">

						<h1 class="title is-1">
							{ props.lang_navbar_king_bot_api }
							<span style="margin-left: 0.2em;" class="subtitle is-5">v{version}</span></h1>

						<div class='box is-radiusless'>

							<article class='media'>

								<div class='media-content'>

									<div class='content'>
										<article style={ start_style }>
											<p class="help">{props.lang_login_reconnect}: {connection_info}</p>
											<Button
												action = { props.lang_login_start }
												onClick = { this.start }
												className = { button_class_start }
												icon = 'fa-play'
											/>
											<p class="help">{help_relogin}</p>
										</article>
										<article id="login" style={ login_style }>
											<h2 class="title is-3">{ props.lang_login_title }</h2>
											<Input
												label={ props.lang_login_gameworld }
												placeholder={ props.lang_login_gameworld }
												value={ gameworld }
												onChange={ e => this.setState({ gameworld: e.target.value }) }
												className={ input_class_gameworld }
												icon='fa-crown'
											/>

											<Input
												label={ props.lang_login_email }
												placeholder={ props.lang_login_email }
												type='email'
												value={ email }
												onChange={ e => this.setState({ email: e.target.value }) }
												className={ input_class_email }
												icon='fa-envelope'
											/>

											<Input
												label={ props.lang_login_password }
												placeholder={ props.lang_login_password }
												type='password'
												value={ password }
												onChange={ e => this.setState({ password: e.target.value }) }
												className={ input_class_password }
												icon='fa-lock'
											/>

											<div class='field'>
												<label class="label">
													{ props.lang_login_sitter_type }
													<i style={{ paddingLeft: '0.7em', fontWeight: 'normal' }}>{props.lang_login_optional}</i>
												</label>
												<p class='control'>
													<div class='select is-radiusless'>
														<select
															value={ sitter_type }
															onChange={ e => this.set_sitter(e.target.value) }
														>
															{sitter_types}
														</select>
													</div>
												</p>
											</div>

											<div style={ sitter_style ?? { display: 'none' } }>
												<p><small>{ props.lang_login_sitter_description }</small></p>
												<Input
													label={ props.lang_login_ingame_name }
													placeholder={ props.lang_login_player_name }
													value={ sitter_name }
													onChange={ e => this.setState({ sitter_name: e.target.value }) }
													className={ input_class_sitter }
													icon='fa-user-crown'
												/>
											</div>

											<div className='control' style={{ marginTop: '30px' }}>
												<Button
													action = { props.lang_login_title }
													onClick = { this.submit }
													className = { button_class_login }
													style = {{ margin: '-0.38em 1rem 1rem 0' }}
													icon = 'fa-sign-in' />
											</div>
										</article>

									</div>
								</div>

							</article>

						</div>

					</div>

				</div>

			</div>
		);
	}
}

export default Login;
