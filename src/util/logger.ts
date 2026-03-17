type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = (process.env.MUSICSORTER_LOG_LEVEL as LogLevel) ?? 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export function createLogger(module: string) {
  return {
    debug(message: string, data?: unknown) {
      if (shouldLog('debug')) {
        console.error(formatMessage('debug', module, message, data));
      }
    },
    info(message: string, data?: unknown) {
      if (shouldLog('info')) {
        console.error(formatMessage('info', module, message, data));
      }
    },
    warn(message: string, data?: unknown) {
      if (shouldLog('warn')) {
        console.error(formatMessage('warn', module, message, data));
      }
    },
    error(message: string, data?: unknown) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', module, message, data));
      }
    },
  };
}
