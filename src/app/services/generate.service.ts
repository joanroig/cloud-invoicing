import * as fs from "fs";
import moment from "moment";
import PdfPrinter from "pdfmake";
import { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { Logger } from "../common/logger";
import Utils from "../common/utils";
import { Company, Customer, Order, Product, VatProcedure } from "../models/sheets.model";
import * as UploadService from "./upload.service";

const logger = Logger.getLogger("Generate");

moment.locale("de");

export async function generateInvoices(
  orders: Order[],
  company: Company,
  products: Map<string, Product>,
  customers: Map<string, Customer>,
  outFolder: string,
  upload: boolean,
) {
  if (upload) {
    UploadService.connectDrive();
  }

  // Generate invoices
  for (const [index, order] of orders.entries()) {
    logger.info(`===== Invoice ${index + 1} =====`);
    logger.info(`Generating invoice: ${order.invoiceId}`);

    const { fileName, filePath } = await buildPdf(
      order,
      company,
      products,
      customers.get(order.customerId),
      outFolder,
    );

    logger.info(`Document ready at: ${filePath}`);

    if (upload) {
      await UploadService.uploadFile(fileName, filePath, "application/pdf");
    }
  }
}

// Get VAT notice text depending on the VAT procedure
function getVatNotice(vat: string): string {
  const procedure = vat as VatProcedure;
  switch (procedure) {
    case VatProcedure.reverseCharge:
      return "Reverse Charge: Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.\n\n";
    case VatProcedure.kleinunternehmer:
      return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.\n\n";
    default:
      logger.error(`Unkwnown VAT procedure: ${vat}`);
      break;
  }
}

function buildItemBody(order: Order, products: Map<string, Product>) {
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
        text: Utils.euro(Utils.euro(item.price).value * parseInt(item.amount)).format(),
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

  return rows;
}

// Generate a pdf for a given order
async function buildPdf(
  order: Order,
  company: Company,
  products: Map<string, Product>,
  customer: Customer,
  outFolder: string,
): Promise<{ fileName: string; filePath: string }> {
  // Define font files
  const fonts = {
    Arial: {
      normal: "fonts/Arial.ttf",
      bold: "fonts/Arial-Bold.ttf",
      italics: "fonts/Arial-Italic.ttf",
    },
  };

  const printer = new PdfPrinter(fonts);

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
          body: buildItemBody(order, products),
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
          getVatNotice(customer.vatProcedure),
          "Bitte überweisen Sie den Rechnungsbetrag innerhalb von 14 Tagen.\n\n\n",
          "Ich danke Ihnen für die gute Zusammenarbeit.\n",
          "Mit freundlichen Grüßen\n\n",
          company.name,
        ],
      },
    ],
    // Footer
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

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const fileName = order.invoiceId + ".pdf";
  const filePath = `${outFolder}${fileName}`;
  pdfDoc.pipe(fs.createWriteStream(filePath));
  pdfDoc.end();

  return { fileName, filePath };
}
