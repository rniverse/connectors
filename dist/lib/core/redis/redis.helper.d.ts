import type { GlideClientConfiguration } from '@valkey/valkey-glide';
import type { RedisConfig } from './redis.type.js';
/** Our config → glide's client configuration. */
export declare function configuration(options: {
    config: RedisConfig;
    appName: string;
}): GlideClientConfiguration;
//# sourceMappingURL=redis.helper.d.ts.map