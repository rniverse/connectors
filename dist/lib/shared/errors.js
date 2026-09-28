// lib/shared/errors.ts
/** Every error a link raises itself. `code` is the stable identity. */
export class LinkError extends Error {
    code;
    /** The link's name (`name` itself is the error class name, `LinkError`). */
    link;
    /** The connector the link belongs to (itself, for a connector). */
    connector;
    constructor(options) {
        super(options.message);
        this.name = 'LinkError';
        this.code = options.code;
        this.link = options.link;
        this.connector = options.connector;
    }
}
//# sourceMappingURL=errors.js.map