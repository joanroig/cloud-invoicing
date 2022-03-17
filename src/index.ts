console.log("> Starting");

import currency from "currency.js";
import "dotenv/config";
import * as fs from "fs";
import { GoogleSpreadsheet } from "google-spreadsheet";
import moment from "moment";
import PdfPrinter from "pdfmake";
import { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { exit } from "process";
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

// Method to read euro values from the sheet
const euro = (value: string | number) =>
  currency(value, {
    separator: " ",
    decimal: ",",
    symbol: "€",
    pattern: "# !",
  });

moment.locale("de");
const today = moment(new Date()).format("DD.MM.YYYY");

const company: Company = {};
const products = new Map<string, Product>();
const customers = new Map<string, Customer>();
const orderIds = new Set<string>();
const orders = new Map<string, Order>();
const invoiceRegistry = new Map<string, number>();

// Initialize Auth - see https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
(async function () {
  console.log("> Connecting to Google Sheets");

  const doc = new GoogleSpreadsheet(process.env.SHEET);

  // Load credentials
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY,
  });

  await doc.loadInfo(); // loads document properties and worksheets
  // console.log(doc.title);
  // await doc.updateProperties({ title: "renamed doc" });

  // Products
  let sheet = doc.sheetsByTitle["Products"];
  let rows = await sheet.getRows();
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
  let previousInvoiceId = 0;
  let previousInvoiceDate: moment.Moment;
  rows.forEach((row, rowIndex) => {
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
        console.log("\nAdding invoice ID: " + order.invoiceId);
        row[OrderKeys.invoiceId] = order.invoiceId;
      }
      if (!row[OrderKeys.invoiceDate]) {
        console.log("\nAdding invoice date: " + order.invoiceDate);
        row[OrderKeys.invoiceDate] = order.invoiceDate;
      }
      // Save the invoice ID and dates into the sheet (no await)
      // row.save();
      orders.set(order.invoiceId, order);
    }
  });

  console.log("\n> Number of invoices to generate: " + orders.size);
  orders.forEach((order) => {
    console.log("\nGenerating invoice: " + order.invoiceId);
    generateInvoice(order);
  });

  console.log("\n> Stopping");
})();

function generateInvoice(order: Order) {
  // Define font files
  const fonts = {
    Arial: {
      normal: "fonts/Arial.ttf",
      bold: "fonts/Arial-Bold.ttf",
      italics: "fonts/Arial-Italic.ttf",
    },
  };

  const printer = new PdfPrinter(fonts);

  // Header
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
        // text: item.price.toFixed(2).replace(".", ",") + " " + item.currency,
        text: item.price,
        style: "itemNumber",
      },
      {
        // text: item.total.toFixed(2).replace(".", ",") + " " + item.currency,
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
      // text: order.total.toFixed(2).replace(".", ",") + " " + order.currency,
      style: "itemTotal",
    },
  ]);

  const customer = customers.get(order.customerId);
  const docDefinition: TDocumentDefinitions = {
    // header: {
    //   columns: [
    //     { text: "HEADER LEFT", style: "documentHeaderLeft" },
    //     { text: "HEADER CENTER", style: "documentHeaderCenter" },
    //     { text: "HEADER RIGHT", style: "documentHeaderRight" },
    //   ],
    // },
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
            fontSize: 8.6,
            margin: [47.5, 0, 0, 0],
            //  style: "documentFooterLeft"
          },
          // { text: "FOOTER CENTER", style: "documentFooterCenter" },
          {
            text: [company.name, "\n", "USt-IdNr.: ", company.vatId],
            // style: "documentFooterRight",
            width: 160,
            fontSize: 8.6,
            // margin: [5, 5, 5, 5],
            alignment: "left",
          },
        ],
      },
    ],
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

      // Line breaks
      "\n",

      // Sender short
      {
        columns: [
          {
            text: `${company.name} - ${company.address} - ${company.cp} ${company.city} - ${company.country} `,
            decoration: "underline",
            fontSize: 8.6,
          },
        ],
      },

      // Line breaks
      "\n",

      // Billing
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
      // Line breaks
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

      // Line breaks
      "\n\n",
      {
        text: "Rechnung",
        bold: true,
        fontSize: 14,
      },

      // Line breaks
      "\n",

      // Items
      {
        table: {
          // headers are automatically repeated if the table spans over multiple pages
          // you can declare how many rows should be treated as headers
          headerRows: 1,
          widths: ["*", 75, 75, 75, 75],
          // heights: 2,
          body: rows,
        }, // table
        //  layout: 'lightHorizontalLines'
        layout: {
          hLineWidth: function (i, node) {
            return 0.7;
          },
          vLineWidth: function (i, node) {
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
          "Mit freundlichen Grüßen,\n\n",
          company.name,
        ],
      },
    ],
    styles: {
      // Document Header
      documentHeaderLeft: {
        fontSize: 10,
        margin: [5, 5, 5, 5],
        alignment: "left",
      },
      documentHeaderCenter: {
        fontSize: 10,
        margin: [5, 5, 5, 5],
        alignment: "center",
      },
      documentHeaderRight: {
        fontSize: 10,
        margin: [5, 5, 5, 5],
        alignment: "right",
      },
      // Document Footer
      documentFooterLeft: {
        fontSize: 10,
        margin: [5, 5, 5, 5],
        alignment: "left",
      },
      documentFooterCenter: {
        fontSize: 10,
        margin: [5, 5, 5, 5],
        alignment: "center",
      },
      documentFooterRight: {
        fontSize: 10,
        margin: [5, 5, 5, 5],
        alignment: "left",
      },
      // Invoice Title
      invoiceTitle: {
        fontSize: 22,
        bold: true,
        alignment: "right",
        margin: [0, 0, 0, 15],
      },
      // Invoice Details
      invoiceSubTitle: {
        fontSize: 12,
        alignment: "right",
      },
      invoiceSubValue: {
        fontSize: 12,
        alignment: "right",
      },
      // Billing Headers
      invoiceBillingTitle: {
        fontSize: 14,
        bold: true,
        alignment: "left",
        margin: [0, 20, 0, 5],
      },
      // Billing Details
      invoiceBillingDetails: {
        alignment: "left",
      },
      invoiceBillingAddressTitle: {
        margin: [0, 7, 0, 3],
        bold: true,
      },
      invoiceBillingAddress: {},
      // Items Header
      itemsHeader: {
        margin: [0, 4.2, 0, 4.2],
        bold: true,
      },
      // Item Title
      itemTitle: {
        bold: true,
      },
      itemSubTitle: {
        italics: true,
        fontSize: 11,
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

      // Items Footer (Subtotal, Total, Tax, etc)
      itemsFooterSubTitle: {
        margin: [0, 5, 0, 5],
        bold: true,
        alignment: "right",
      },
      itemsFooterSubValue: {
        margin: [0, 5, 0, 5],
        bold: true,
        alignment: "center",
      },
      itemsFooterTotalTitle: {
        margin: [0, 5, 0, 5],
        bold: true,
        alignment: "right",
      },
      itemsFooterTotalValue: {
        margin: [0, 5, 0, 5],
        bold: true,
        alignment: "center",
      },
      signaturePlaceholder: {
        margin: [0, 70, 0, 0],
      },
      signatureName: {
        bold: true,
        alignment: "center",
      },
      signatureJobTitle: {
        italics: true,
        fontSize: 10,
        alignment: "center",
      },
      notesTitle: {
        fontSize: 10,
        bold: true,
        margin: [0, 50, 0, 3],
      },
      notesText: {
        fontSize: 10,
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

  const options = {
    // ...
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition, options);
  pdfDoc.pipe(fs.createWriteStream("./out/" + order.invoiceId + ".pdf"));
  pdfDoc.end();
}

function checkVatProcedure(vat: string): string {
  const vatProcedure = vat as VatProcedure;
  switch (vatProcedure) {
    case VatProcedure.reverseCharge:
      return "Reverse Charge: Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.\n\n";
    case VatProcedure.kleinunternehmer:
      return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.\n\n";
    default:
      console.error("Unkwnown vat procedure: " + vat);
      break;
  }
}

function error(str: string) {
  console.error(str);
  exit(1);
}
