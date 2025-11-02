import { pino } from 'pino';
import pretty from 'pino-pretty';

// Create a pretty print stream that works synchronously
const stream = pretty({
  colorize: true,
  sync: true, // Synchronous mode for tests
});

export const log = pino({
  level: process.env.LOG_LEVEL || 'info',
}, stream);

log.info('Logger initialized with level: %s', log.level);

