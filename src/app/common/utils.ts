import currency from "currency.js";
import { VatProcedure } from "../models/sheets.model";
import { Logger } from "./logger";

const logger = Logger.getLogger("Utils");

export default class Utils {
  // Read euro-formatted values from the sheet
  static euro = (value: string | number) =>
    currency(value, {
      separator: " ",
      decimal: ",",
      symbol: "€",
      pattern: "# !",
    });

  // Log and throw error
  static error(str: string) {
    logger.error(str);
    throw new Error(str);
  }
}
