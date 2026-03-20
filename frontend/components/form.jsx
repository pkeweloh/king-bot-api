import { h } from 'preact';
import Input from '../components/input';
import DoubleInput from '../components/double_input';
import Select from '../components/select';

export { Input, DoubleInput, Select };

export const Button = ({ action, className, onClick, style, icon, disabled, title }) => (
	<button
		className={ 'button is-radiusless ' + className }
		onClick={ onClick }
		{ ...style ? { style: style } : {} }
		disabled={ disabled }
		title={ title }
	>
		{icon && <span class="icon"><i class={ 'fas ' + icon }></i></span>}
		<span>{action}</span>
	</button>
);

export const Help = ({ className = 'help', content, style }) => (
	<p className={ className && className.includes('help') ? className : 'help ' + className } style={ style }>{content}</p>
);
