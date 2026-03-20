import { h } from 'preact';

const overlayStyle = {
	position: 'absolute',
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	backgroundColor: 'rgba(255,255,255,0.92)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	zIndex: 1,
	padding: '0.5rem',
};

const messageStyle = {
	fontSize: '1rem',
	fontWeight: 500,
	textTransform: 'none',
	marginLeft: '0.35rem',
};

export default function TableStatusLayer({ message, searching = false, onClose }) {
	if (!message) return null;

	return (
		<div style={ overlayStyle }>
			<div style={{ display: 'flex', alignItems: 'center' }}>
				{ searching && (
					<span class='icon is-medium'>
						<i class='fas fa-spinner fa-pulse fa-fw'></i>
					</span>
				) }
				{ !searching && (
					<span class='icon has-text-warning'>
						<i class='fas fa-exclamation-triangle'></i>
					</span>
				) }
				<span style={ messageStyle }>
					{ message }
				</span>
				{ !searching && onClose && (
					<button
						type='button'
						class='delete is-small'
						onClick={ onClose }
						aria-label='close'
						style={{ marginLeft: '0.75rem' }}
					/>
				) }
			</div>
		</div>
	);
}
