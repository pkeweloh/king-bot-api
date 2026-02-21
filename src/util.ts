import merge from 'deepmerge';
import logger from './logger';

export function log(obj: any): void {
	logger.info(obj);
}

export function list_remove(item: any, list: any[]): any[] {
	var idx = list.indexOf(item);
	if (idx != -1) {
		return list.splice(idx, 1); // The second parameter is the number of elements to remove.
	}

	return list;
}

export const sleep = (sec: number) => new Promise(res => setTimeout(res, sec * 1000));

export const sleep_ms = (ms: number) => new Promise(res => setTimeout(res, ms));

export function get_date(): number {
	return Math.floor(Number(Date.now()) / 1000);
}

export function get_ms(): number {
	return Date.now();
}

export function find_state_data(ident: string, data: any[], contains: boolean = false): any {
	if (!data)
		return [];
	if (typeof data.find !== 'function')
		return []; // avoid TypeError

	const found_obj = data.find((x: any) => {
		return contains ? x.name.includes(ident) : x.name == ident;
	});
	if (found_obj)
		return found_obj.data;
	logger.error(found_obj, 'find_state_data');
}

export function get_random_int(min: number, max: number): number {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function get_random_string(n: number, charset?: string): string {
	let res = '';
	let chars =
		charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let charLen = chars.length;
	for (var i = 0; i < n; i++) {
		res += chars.charAt(Math.floor(Math.random() * charLen));
	}
	return res;
}

export function get_diff_time(time: number): number {
	return Number(time) - get_date();
}

/**
 * python's zip function equivalent
 * @param arrays array of pairs
 * @returns zip array object
 */
export function zip(arrays: any[]) {
	var shortest = arrays.length == 0 ? [] : arrays.reduce(function (a, b) {
		return a.length < b.length ? a : b;
	});
	return shortest.map(function (_: any, i: string | number) {
		return arrays.map(function (array) {
			return array[i];
		});
	});
}

export function clash_obj(merge_obj: any, ident: string, ident2: string = ''): any {
	let rv: any = {};

	if (!merge_obj) return merge_obj;

	// TODO prettify this function a little bit
	// merges response and cache together, response overwrites cache
	if (ident2) {
		if (merge_obj[ident] && merge_obj[ident2]) {
			merge_obj = merge(merge_obj[ident], merge_obj[ident2]);
		} else if (merge_obj[ident]) {
			merge_obj = merge_obj[ident];
		} else if (merge_obj[ident2]) {
			merge_obj = merge_obj[ident2];
		}
	} else {
		if (merge_obj[ident]) merge_obj = merge_obj[ident];
	}

	if (Array.isArray(merge_obj)) {
		rv = [];

		for (let i = 0; i < merge_obj.length; i++) {
			rv.push(clash_obj(merge_obj[i], ident, ident2));
		}

		return rv;
	}


	if (is_object(merge_obj)) {
		rv = {};

		let keys = Object.keys(merge_obj);
		for (let i = 0; i < keys.length; i++) {
			rv[keys[i]] = clash_obj(merge_obj[keys[i]], ident, ident2);
		}

		return rv;
	}

	return merge_obj;
}

export function is_object(val: any) {
	if (val === null) { return false; }
	return ((typeof val === 'function') || (typeof val === 'object'));
}

export function camelcase_to_string(text: string) {
	if (!text)
		return '';
	return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

export function range(start: number, end: number): number[] {
	start = Math.floor(start);
	end = Math.floor(end);

	const diff = end - start;
	if (diff === 0) {
		return [start];
	}

	const keys = Array(Math.abs(diff) + 1).keys();
	return Array.from(keys).map(x => {
		const increment = end > start ? x : -x;
		return start + increment;
	});
}