import currency from "currency.js";
import { Logger } from "./logger";

const logger = Logger.getLogger("Utils");

export default class Utils {
  // Read euro-formatted values from the spreadsheet
  static euro = (value: string | number) =>
    currency(value, {
      separator: " ",
      decimal: ",",
      symbol: "€",
      pattern: "# !",
    });

  // Log and throw error
  static throw(str: string) {
    logger.error(str);
    throw new Error(str);
  }
}
