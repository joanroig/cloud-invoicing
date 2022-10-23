import winston, { format, transports } from "winston";

export class Logger {
  // Setup log format
  logFormat = winston.format.printf(
    (info) => `${info.timestamp} ${info.level} [${info.label}]: ${info.message}`,
  );
  options: winston.LoggerOptions = {
    exitOnError: false,
    level: "debug",
  };

  logger: winston.Logger;

  constructor(name: string) {
    this.options.format = winston.format.combine(
      winston.format((info) => {
        info.level = info.level.toUpperCase();
        return info;
      })(),
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      format.metadata({
        fillExcept: ["message", "level", "timestamp", "label"],
      }),
      winston.format.label({ label: name }),
    );
    this.options.transports = [
      new transports.Console({
        format: format.combine(format.colorize(), this.logFormat),
      }),
    ];

    this.logger = winston.createLogger(this.options);
  }

  public static getLogger(name: string): Logger {
    return new Logger(name);
  }

  get logopts() {
    return this.options;
  }

  debug(format: any, ...params: any[]): void {
    this.logger.debug([format].concat(params));
  }

  info(format: any, ...params: any[]): void {
    this.logger.info([format].concat(params));
  }

  warn(format: any, ...params: any[]): void {
    this.logger.warn([format].concat(params));
  }

  error(format: any, ...params: any[]): void {
    this.logger.error([format].concat(params));
  }
}
