// get the Console class
import config from "config";
import "dotenv/config";
import { GoogleSpreadsheet } from "google-spreadsheet";
import moment from "moment";
import {
  Company,
  CompanyKeys,
  Customer,
  CustomerKeys,
  ItemPrefixKeys,
  Order,
  OrderKeys,
  Product,
  ProductKeys,
} from "../models/sheets.model";
import { generateInvoice } from "./generator";
import { connectDrive } from "./uploader";
import { euro, logger } from "./utils";

// Sheets connection
let doc: GoogleSpreadsheet;
// Upload to drive flag
let upload: boolean;
// Out folder path
let outFolder: string;

moment.locale("de");

export async function run(cloud = true): Promise<string> {
  const company: Company = {};
  const products = new Map<string, Product>();
  const customers = new Map<string, Customer>();
  const orderIds = new Set<string>();
  const orders = new Map<string, Order>();
  const invoiceRegistry = new Map<string, number>();
  const today = moment(new Date()).format("DD.MM.YYYY");

  if (cloud) {
    logger.info("# SERVER RUN #\n");
    // In Google Cloud, only the tmp folder can be written
    outFolder = "/tmp/";
    // In cloud mode, upload to google drive is mandatory
    upload = true;
  } else {
    logger.info("# RUNNING ONCE #\n");
    outFolder = "./out/";
    upload = config.get("upload-to-drive");
  }

  if (upload) {
    // Conect to Google Drive
    connectDrive();
  }

  // Conect to Google Sheets
  logger.info("Connecting to Google Sheets\n");
  doc = new GoogleSpreadsheet(process.env.sheet_id);

  // Load credentials
  await doc.useServiceAccountAuth({
    client_email: process.env.client_email,
    private_key: process.env.private_key,
  });

  // Load document properties and worksheets
  await doc.loadInfo();
  logger.info(`Google Sheet title: ${doc.title}\n`);

  // Parse Products
  let sheet = doc.sheetsByTitle["Products"];
  let rows = await sheet.getRows();
  logger.info(`Parsing ${rows.length} products`);

  rows.forEach((row, rowIndex) => {
    const product: Product = {};
    Object.entries(ProductKeys).forEach(([key, tableKey]) => {
      if (!row[tableKey]) {
        error(`Error: Missing product '${tableKey}' in row: ${rowIndex}`);
      }
      product[key as keyof typeof ProductKeys] = row[tableKey];
    });
    products.set(product.id, product);
  });

  // Parse Customers
  sheet = doc.sheetsByTitle["Customers"];
  rows = await sheet.getRows();
  logger.info(`Parsing ${rows.length} customers`);

  rows.forEach((row, rowIndex) => {
    const customer: Customer = {};
    Object.entries(CustomerKeys).forEach(([key, tableKey]) => {
      if (!row[tableKey] && ![CustomerKeys.vatId].includes(tableKey)) {
        error(`Error: Missing customer '${tableKey}' in row: ${rowIndex}`);
      }
      customer[key as keyof typeof CustomerKeys] = row[tableKey];
    });
    customers.set(customer.id, customer);
  });

  // Parse Company
  sheet = doc.sheetsByTitle["Company"];
  rows = await sheet.getRows();

  rows.forEach((row, rowIndex) => {
    Object.entries(CompanyKeys).forEach(([key, tableKey]) => {
      if (!row[tableKey]) {
        error(`Error: Missing company '${tableKey}' in row: ${rowIndex}`);
      }
      company[key as keyof typeof CompanyKeys] = row[tableKey];
    });
  });

  // Parse Orders
  sheet = doc.sheetsByTitle["Orders"];
  rows = await sheet.getRows();
  logger.info(`Parsing ${rows.length} orders\n`);

  let previousInvoiceId = 0;
  let previousInvoiceDate: moment.Moment;

  for (const [rowIndex, row] of rows.entries()) {
    const order: Order = { items: [] };
    Object.entries(OrderKeys).forEach(([key, tableKey]) => {
      if (
        !row[tableKey] &&
        ![OrderKeys.invoiceId, OrderKeys.invoiceDate].includes(tableKey)
      ) {
        error(`Error: Missing order '${tableKey}' in row: ${rowIndex}`);
      }
      order[key as keyof typeof OrderKeys] = row[tableKey];
    });

    // Map the order items to an array
    let more = true;
    let index = 1;
    while (more) {
      // Look for order items by checking the columns in blocks (Product X, Amount X, Price X)
      const productId = row[ItemPrefixKeys.productId + index];
      const amount = row[ItemPrefixKeys.amount + index];
      const price = row[ItemPrefixKeys.price + index];

      if ([productId, amount, price].every((el) => Boolean(!el))) {
        // If all three values are empty (or the columns at index X do not exist), then stop searching
        more = false;
      } else if ([productId, amount, price].every((el) => Boolean(el))) {
        // If all three columns contain values, save the item and prepare to look for the next one (X + 1)
        order.items.push({ productId, amount, price });
        index++;
      } else {
        // Throw an error if some of the columns are missing information
        error(
          `Error: Incomplete item '${productId}' '${amount}' '${price}' in row: ${rowIndex}`
        );
      }
    }

    // Check if the order prices are correct
    const sum = order.items.reduce((partialSum, a) => {
      const subtotal = euro(a.price).value * parseInt(a.amount);
      if (subtotal === 0) {
        error(`Error: Subtotal is zero in row: ${rowIndex}`);
      }
      return partialSum + subtotal;
    }, 0);
    order.total = euro(sum).format();

    // Generate invoice date if its not provided
    if (!order.invoiceDate) {
      order.invoiceDate = today;
    }
    // Update the invoice registry to count invoices by year and month
    const prefix = moment(order.invoiceDate, "DD.MM.YYYY").format("YYYYMM");
    const suffix = (invoiceRegistry.get(prefix) ?? 0) + 1; // Calculate next suffix
    invoiceRegistry.set(prefix, suffix);

    // Generate invoice ID if not provided
    if (!order.invoiceId) {
      if (suffix > 99) {
        error(`Error: More than 99 invoices in one month.`);
      }

      // Suffix always has 2 digits
      const suffixString = suffix.toLocaleString("en-US", {
        minimumIntegerDigits: 2,
        useGrouping: false,
      });
      order.invoiceId = prefix + suffixString;
    }

    // Check for duplicate invoice IDs
    if (orderIds.has(order.invoiceId)) {
      error(`Error: Duplicated invoice ID: ${order.invoiceId}`);
    }

    // Check if the invoice ID is greater than the previous
    if (previousInvoiceId > parseInt(order.invoiceId)) {
      error(
        `Current invoice ID is lower than previous invoice: ${previousInvoiceId} > ${order.invoiceId}`
      );
    }
    previousInvoiceId = parseInt(order.invoiceId);

    // Check if the invoice date comes after the previous invoice
    const invoiceDate = moment(order.invoiceDate, "DD.MM.YYYY");
    if (previousInvoiceDate?.isAfter(invoiceDate)) {
      error(
        `Error: The invoice date is before the previous invoice: ${previousInvoiceDate.format(
          "DD.MM.YYYY"
        )} > ${order.invoiceDate}`
      );
    }
    previousInvoiceDate = invoiceDate;

    orderIds.add(order.invoiceId);

    // Check there are missing fields and add them in Google Sheets
    if (order.run === "TRUE") {
      row[OrderKeys.run] = "FALSE";
      if (!row[OrderKeys.invoiceId]) {
        logger.info(`Adding invoice ID: ${order.invoiceId}`);
        row[OrderKeys.invoiceId] = order.invoiceId;
      }
      if (!row[OrderKeys.invoiceDate]) {
        logger.info(`Adding invoice date: ${order.invoiceDate}`);
        row[OrderKeys.invoiceDate] = order.invoiceDate;
      }
      // Wait to save the idata into the sheet
      await row.save();
      orders.set(order.invoiceId, order);
    }
  }

  logger.info(`Generating ${orders.size} invoices\n`);

  for (const order of orders.values()) {
    logger.info(`Generating invoice: ${order.invoiceId}`);
    const filePath = await generateInvoice(
      order,
      company,
      products,
      customers,
      outFolder,
      upload
    );
    logger.info(`Invoice ready at: ${filePath}\n`);
  }

  logger.info(`Generated ${orders.size} invoices\n`);
  return `Generated ${orders.size} invoices.`;
}

function error(str: string) {
  logger.error(str + "\n");
  throw new Error(str);
}
