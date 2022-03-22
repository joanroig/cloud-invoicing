import currency from "currency.js";
import winston, { format, transports } from "winston";
import path from "path";

// Method to read euro values from the sheet
export const euro = (value: string | number) =>
  currency(value, {
    separator: " ",
    decimal: ",",
    symbol: "€",
    pattern: "# !",
  });

// Setup Logger
const logFormat = format.printf(
  (info) => `${info.timestamp} ${info.level} [${info.label}]: ${info.message}`
);
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: format.combine(
    format.label({ label: path.basename(process.mainModule.filename) }),
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    // Format the metadata object
    format.metadata({ fillExcept: ["message", "level", "timestamp", "label"] })
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), logFormat),
    }),
  ],
  exitOnError: false,
});
