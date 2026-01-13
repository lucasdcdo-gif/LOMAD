import winston from 'winston';

const { combine, timestamp, printf, colorize, align, json } = winston.format;

// Custom Format for Console
const consoleFormat = combine(
    colorize({ all: true }),
    timestamp({
        format: 'YYYY-MM-DD hh:mm:ss.SSS A',
    }),
    align(),
    printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
);

// Custom Format for File/JSON (Structure for parsing)
const jsonFormat = combine(
    timestamp(),
    json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: jsonFormat,
    defaultMeta: { service: 'meeting-transcriber-pro' },
    transports: [
        // 1. Console Transport (Best for Render Dashboard)
        new winston.transports.Console({
            format: consoleFormat,
        }),

        // 2. File Transport (Good for local debug or short-term Render storage)
        // Note: Render filesystem is ephemeral. These files Reset on deploy/restart.
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// Wrapper to log http requests easily
export const logRequest = (req, res, next) => {
    logger.info(`HTTP ${req.method} ${req.url} - IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    next();
};

export default logger;
