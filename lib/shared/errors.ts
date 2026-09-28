// lib/shared/errors.ts

import type { LinkErrorCode } from './shared.type';

/** Every error a link raises itself. `code` is the stable identity. */
export class LinkError extends Error {
	readonly code: LinkErrorCode;
	/** The link's name (`name` itself is the error class name, `LinkError`). */
	readonly link: string;
	/** The connector the link belongs to (itself, for a connector). */
	readonly connector: string;

	constructor(options: {
		code: LinkErrorCode;
		link: string;
		connector: string;
		message: string;
	}) {
		super(options.message);
		this.name = 'LinkError';
		this.code = options.code;
		this.link = options.link;
		this.connector = options.connector;
	}
}
