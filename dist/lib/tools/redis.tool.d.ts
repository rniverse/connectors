import type { GlideClientConfiguration } from '@valkey/valkey-glide';
import type { RedisConnectorConfig } from 'lib/types/redis.type';
export declare function parseRedisUrl(urlStr: string): {
    host: string;
    port: number;
    useTLS: boolean;
    credentials: {
        password: string;
        username: string | undefined;
    } | undefined;
};
export declare function initRedis(connection: RedisConnectorConfig): GlideClientConfiguration;
//# sourceMappingURL=redis.tool.d.ts.map