import config from "config";
import "dotenv/config";
import { JWT } from 'google-auth-library';
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

  // Initialize auth
  const serviceAccountAuth = new JWT({
    email: process.env.client_email,
    key: process.env.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  // Conect to Google Sheets
  logger.info("Connecting to Google Sheets");
  doc = new GoogleSpreadsheet(process.env.spreadsheet_id, serviceAccountAuth);

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

    await GenerateService.generateInvoices(orders, company, products, customers, outFolder, upload);

    result =
      `${orders.length} invoice${orders.length === 1 ? "" : "s"} ` +
      `generated${upload ? " and uploaded" : ""}`;
  } else {
    result =
      "Nothing to generate, run again after marking the 'Run' checkbox in some orders of the spreadsheet.";
  }

  logger.info(result);
  return result;
}
