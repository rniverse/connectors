// lib/shared/setting.ts
import { environment } from '@rniverse/utils/env';
import { boundedParseInt } from '@rniverse/utils/generic';
import { LinkError } from './errors.js';
/** A numeric setting: the explicit option, else its env var, else the default. */
export function setting(options) {
    return (options.value ??
        boundedParseInt(environment.get(options.env), {
            min: options.min,
            fallback: options.fallback,
        }));
}
/**
 * The identity a connector shows the server: `appName`, else `INSTANCE_NAME`.
 * There is no default — a connector without one throws `MISSING_APP_NAME`.
 */
export function appName(options) {
    const resolved = options.value ?? environment.get('INSTANCE_NAME');
    if (!resolved) {
        throw new LinkError({
            code: 'MISSING_APP_NAME',
            link: options.connector,
            connector: options.connector,
            message: `${options.connector}: set config.appName or the INSTANCE_NAME env var`,
        });
    }
    return resolved;
}
//# sourceMappingURL=setting.js.map