// get the Console class
import { auth, drive, drive_v3 } from "@googleapis/drive";
import config from "config";
import currency from "currency.js";
import "dotenv/config";
import * as fs from "fs";
import { GoogleSpreadsheet } from "google-spreadsheet";
import moment from "moment";
import path from "path";
import PdfPrinter from "pdfmake";
import { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import winston, { format, transports } from "winston";
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
  VatProcedure,
} from "./keys.model";

// Setup Logger
const logFormat = format.printf(
  (info) => `${info.timestamp} ${info.level} [${info.label}]: ${info.message}`
);
const logger = winston.createLogger({
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

// Sheet and drive folder
const doc = new GoogleSpreadsheet(process.env.sheet_id);
const driveFolderId = process.env.folder_id;

// // Check memory
// const used = process.memoryUsage();
// Object.entries(used).map(([k, v]: [string, number]) => {
//   logger.info(`${k} -> ${Math.round((v / 1024 / 1024) * 100) / 100} mb`);
// });
// const usedMemory = os.totalmem() - os.freemem(),
//   totalMemory = os.totalmem();
// const getpercentage = ((usedMemory / totalMemory) * 100).toFixed(2) + "%";
// logger.info("Memory used in GB: " + (usedMemory / Math.pow(1024, 3)).toFixed(2));
// logger.info("Used memory: " + getpercentage + "\n");

// // Check if the drive folder is accessible and print existing files
// driveService.files.list(
//   {
//     pageSize: 10,
//     fields: "nextPageToken, files(id, name)",
//   },
//   (err, res) => {
//     if (err) return logger.error("The API returned an error: " + err);
//     const files = res.data.files;
//     if (files.length) {
//       logger.info("Files:");
//       files.map((file) => {
//         logger.info(`${file.name} (${file.id})`);
//       });
//     } else {
//       logger.info("No files found.");
//     }
//   }
// );

// Google Drive login
const driveAuth = new auth.GoogleAuth({
  credentials: {
    client_email: process.env.client_email,
    private_key: process.env.private_key,
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});

// Google Drive connection
let driveService: drive_v3.Drive;

// Out folder
let outFolder: string;
let uploadToDrive: boolean = config.get("upload-to-drive");

// Method to read euro values from the sheet
const euro = (value: string | number) =>
  currency(value, {
    separator: " ",
    decimal: ",",
    symbol: "€",
    pattern: "# !",
  });

moment.locale("de");

export async function run(standalone = false): Promise<string> {
  if (standalone) {
    logger.info("# STANDALONE RUN #\n");
    outFolder = "./out/";
  } else {
    logger.info("# RUN COMMAND RECEIVED #\n");
    outFolder = "/tmp/";
    // In cloud mode, google drive is mandatory
    uploadToDrive = true;
  }

  const today = moment(new Date()).format("DD.MM.YYYY");

  const company: Company = {};
  const products = new Map<string, Product>();
  const customers = new Map<string, Customer>();
  const orderIds = new Set<string>();
  const orders = new Map<string, Order>();
  const invoiceRegistry = new Map<string, number>();

  if (uploadToDrive) {
    logger.info("Connecting to Google Drive");
    driveService = drive({ version: "v3", auth: driveAuth });
  }

  logger.info("Connecting to Google Sheets\n");

  // Load credentials
  await doc.useServiceAccountAuth({
    client_email: process.env.client_email,
    private_key: process.env.private_key,
  });

  await doc.loadInfo(); // loads document properties and worksheets
  logger.info(`Google Sheet title: ${doc.title}\n`);

  // Products
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

  // Customers
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

  // Company
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

  // Orders
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
      const productId = row[ItemPrefixKeys.productId + index];
      const amount = row[ItemPrefixKeys.amount + index];
      const price = row[ItemPrefixKeys.price + index];

      if ([productId, amount, price].every((el) => Boolean(!el))) {
        more = false;
      } else if ([productId, amount, price].every((el) => Boolean(el))) {
        order.items.push({ productId, amount, price });
        index++;
      } else {
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
      // console.info("No invoice ID, calculating...");

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

    // Check if the order needs to be processed and add the missing fields
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
      // Wait to save the invoice ID and dates into the sheet
      await row.save();
      orders.set(order.invoiceId, order);
    }
  }

  logger.info(`Number of invoices to generate: ${orders.size}\n`);
  for (const order of orders.values()) {
    logger.info(`Generating invoice: ${order.invoiceId}`);
    await generateInvoice(order, company, products, customers);
    logger.info(`Invoice ready at: ${outFolder}${order.invoiceId}.pdf\n`);
  }

  // Remove drive session
  driveService = undefined;

  logger.info("All done!");
  return `Number of invoices generated: ${orders.size}`;
}

async function generateInvoice(
  order: Order,
  company: Company,
  products: Map<string, Product>,
  customers: Map<string, Customer>
) {
  // Define font files
  const fonts = {
    Arial: {
      normal: "fonts/Arial.ttf",
      bold: "fonts/Arial-Bold.ttf",
      italics: "fonts/Arial-Italic.ttf",
    },
  };

  const printer = new PdfPrinter(fonts);

  // Item headers
  const rows: TableCell[][] = [
    [
      {
        text: "Bezeichnung",
        style: "itemsHeader",
      },
      {
        text: "Anzahl",
        style: ["itemsHeader", "center"],
      },
      {
        text: "Einheit",
        style: ["itemsHeader", "center"],
      },
      {
        text: "Einzelpreis",
        style: ["itemsHeader", "center"],
      },
      {
        text: "Gesamtpreis",
        style: ["itemsHeader", "center"],
      },
    ],
  ];
  // Item rows
  order.items.forEach((item) => {
    rows.push([
      {
        text: products.get(item.productId).description,
        style: "itemDescription",
      },
      {
        text: item.amount,
        style: "itemNumber",
      },
      {
        text: products.get(item.productId).unit,
        style: "itemNumber",
      },
      {
        text: item.price,
        style: "itemNumber",
      },
      {
        text: euro(euro(item.price).value * parseInt(item.amount)).format(),
        style: "itemNumber",
      },
    ]);
  });
  // Total row
  rows.push([
    {
      text: "Rechnungsbetrag",
      style: "itemsHeader",
      colSpan: 4,
    },
    "",
    "",
    "",
    {
      text: order.total,
      style: "itemTotal",
    },
  ]);

  const customer = customers.get(order.customerId);
  const docDefinition: TDocumentDefinitions = {
    content: [
      // Header
      {
        stack: [
          {
            text: company.name,
            alignment: "right",
            fontSize: 12,
          },
          {
            text: [
              company.address,
              "\n",
              `${company.cp} ${company.city}, ${company.country}`,
              "\n",
              `Tel: ${company.telephone}`,
              "\n",
              `Mail: ${company.mail}`,
            ],
            alignment: "right",
          },
        ],
      },
      "\n",
      // Sender info
      {
        columns: [
          {
            text: `${company.name} - ${company.address} - ${company.cp} ${company.city} - ${company.country} `,
            decoration: "underline",
            fontSize: 8.6,
          },
        ],
      },
      "\n",
      // Customer info
      {
        text: [
          customer.businessName,
          "\n",
          customer.address,
          "\n",
          `${customer.cp} ${customer.city}`,
          "\n",
          customer.country,
          "\n",
          customer.vatId,
          "\n",
        ],
      },
      "\n",
      // Invoice data
      {
        text: [
          "Rechnungs-Nr.: ",
          { text: order.invoiceId.toString(), bold: true },
          "\n",
          "Rechnungsdatum: ",
          { text: order.invoiceDate, bold: true },
          "\n",
          "Leistungsdatum: ",
          {
            text: moment(order.executionDate, "DD.MM.YYYY").format("MMMM YYYY"),
            bold: true,
          },
        ],
        alignment: "right",
      },
      "\n\n",
      {
        text: "Rechnung",
        bold: true,
        fontSize: 14,
      },
      "\n",
      // Items
      {
        table: {
          // headers are automatically repeated if the table spans over multiple pages
          // you can declare how many rows should be treated as headers
          headerRows: 1,
          widths: ["*", 75, 75, 75, 75],
          body: rows,
        },
        layout: {
          hLineWidth: function () {
            return 0.7;
          },
          vLineWidth: function () {
            return 0.7;
          },
        },
      },
      "\n",
      {
        text: [
          checkVatProcedure(customer.vatProcedure),
          "Bitte überweisen Sie den Rechnungsbetrag innerhalb von 14 Tagen.\n\n\n",
          "Ich danke Ihnen für die gute Zusammenarbeit.\n",
          "Mit freundlichen Grüßen\n\n",
          company.name,
        ],
      },
    ],
    footer: [
      {
        canvas: [
          {
            type: "line",
            x1: 45,
            x2: 595 - 45,
            y1: 10,
            y2: 10,
            lineWidth: 1.5,
            lineColor: "#a5a5a5",
          },
        ],
      },
      "\n",
      {
        columns: [
          {
            text: [
              { text: "Bankverbindung:", bold: true },
              "\nBank: ",
              company.bank,
              "\nIBAN: ",
              company.iban,
              "\nBIC: ",
              company.bic,
            ],
            fontSize: 10.3,
            margin: [47.5, 0, 0, 0],
          },
          {
            text: [company.name, "\n", "USt-IdNr.: ", company.vatId],
            width: 170,
            fontSize: 10.3,
            alignment: "left",
          },
        ],
      },
    ],
    styles: {
      // Items Header
      itemsHeader: {
        margin: [0, 4.2, 0, 4.2],
        bold: true,
      },
      itemDescription: {
        margin: [0, 4.2, 0, 4.2],
      },
      itemNumber: {
        margin: [0, 4.2, 0, 4.2],
        alignment: "center",
      },
      itemTotal: {
        margin: [0, 4.2, 0, 4.2],
        bold: true,
        alignment: "center",
      },
      center: {
        alignment: "center",
      },
    },
    defaultStyle: {
      font: "Arial",
      fontSize: 10.3,
      lineHeight: 1.15,
      columnGap: 20,
    },
    // [left, top, right, bottom] or [horizontal, vertical] or just a number for equal margins
    pageMargins: [47.5, 69, 47.5, 120],
  };

  const options = {};
  const pdfDoc = printer.createPdfKitDocument(docDefinition, options);
  const filename = order.invoiceId + ".pdf";
  const filepath = `${outFolder}${filename}`;
  pdfDoc.pipe(fs.createWriteStream(filepath));
  pdfDoc.end();

  if (uploadToDrive) {
    const result = await uploadFile(filename, filepath, "application/pdf");
    logger.info(result);
  }
}

function checkVatProcedure(vat: string): string {
  const vatProcedure = vat as VatProcedure;
  switch (vatProcedure) {
    case VatProcedure.reverseCharge:
      return "Reverse Charge: Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.\n\n";
    case VatProcedure.kleinunternehmer:
      return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.\n\n";
    default:
      logger.error(`Unkwnown vat procedure: ${vat}`);
      break;
  }
}

// Upload file to Google Drive
async function uploadFile(
  fileName: string,
  filePath: string,
  fileMimeType: string
): Promise<string> {
  const list = await driveService.files.list({
    q: `name = "${fileName}" and "${driveFolderId}" in parents`,
    pageSize: 10,
    fields: "nextPageToken, files(id, name)",
  });

  const files = list.data.files;
  if (files.length) {
    await driveService.files.update({
      fileId: files[0].id,
      media: {
        mimeType: fileMimeType,
        body: fs.createReadStream(filePath),
      },
    });
    return `Google Drive: Found previous file, updating: ${fileName}`;
  } else {
    await driveService.files.create({
      requestBody: {
        name: fileName,
        mimeType: fileMimeType,
        parents: driveFolderId ? [driveFolderId] : [],
      },
      media: {
        mimeType: fileMimeType,
        body: fs.createReadStream(filePath),
      },
    });
    return `Google Drive: No previous file found, creating: ${fileName}`;
  }
}

function error(str: string) {
  logger.error(str + "\n");
  throw new Error(str);
}
