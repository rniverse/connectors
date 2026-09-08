import type { GlideClientConfiguration } from '@valkey/valkey-glide';
import type { RedisConnectorConfig } from '../types/redis.type.js';
type ResolvedConnection = {
    host: string;
    port: number;
    useTLS: boolean;
    credentials?: {
        username?: string;
        password: string;
    };
};
export declare function parseRedisUrl(urlStr: string): ResolvedConnection;
export declare function initRedis(connection: RedisConnectorConfig): GlideClientConfiguration;
export {};
//# sourceMappingURL=redis.tool.d.ts.map