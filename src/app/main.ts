import config from "config";
import "dotenv/config";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { Logger } from "./common/logger";
import * as GenerateService from "./services/generate.service";
import * as ParseService from "./services/parse.service";

const logger = Logger.getLogger("Main");

// Sheets connection
let doc: GoogleSpreadsheet;
// Upload to drive flag
let upload: boolean;
// Out folder path
let outFolder: string;

export async function run(cloud = true): Promise<string> {
  if (cloud) {
    logger.info("# SERVER RUN #");
    // In Google Cloud, only the tmp folder can be written
    outFolder = "/tmp/";
    // In cloud mode, upload to google drive is mandatory
    upload = true;
  } else {
    logger.info("# RUNNING ONCE #");
    outFolder = "./out/";
    upload = config.get("upload-to-drive");
  }

  // Conect to Google Sheets
  logger.info("Connecting to Google Sheets");
  doc = new GoogleSpreadsheet(process.env.spreadsheet_id);

  // Load credentials
  await doc.useServiceAccountAuth({
    client_email: process.env.client_email,
    private_key: process.env.private_key,
  });

  // Load document properties and worksheets
  await doc.loadInfo();
  logger.info(`Google Sheets title: ${doc.title}`);

  // Parse data
  const products = await ParseService.parseProducts(doc);
  const customers = await ParseService.parseCustomers(doc);
  const company = await ParseService.parseCompany(doc);
  const orders = await ParseService.parseOrders(doc);

  let result;

  if (orders.length > 0) {
    logger.info(`Generating ${orders.length} invoices`);

    await GenerateService.generateInvoices(
      orders,
      company,
      products,
      customers,
      outFolder,
      upload
    );

    result = `${orders.length} invoice${
      orders.length === 1 ? "" : "s"
    } generated${upload ? " and uploaded" : ""}`;
  } else {
    result =
      "Nothing to generate, run again after marking the 'Run' checkbox in some orders of the spreadsheet.";
  }

  logger.info(result);
  return result;
}
