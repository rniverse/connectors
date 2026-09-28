import { Kafka } from 'kafkajs';
import type { KafkaConfig } from './kafka.type.js';
/** An array as-is; a comma-separated string split and trimmed. */
export declare function brokers(options: {
    value: string | string[];
}): string[];
/** Our config → a kafkajs `Kafka` client (no connection yet). */
export declare function client(options: {
    config: KafkaConfig;
    appName: string;
}): Kafka;
//# sourceMappingURL=kafka.helper.d.ts.map