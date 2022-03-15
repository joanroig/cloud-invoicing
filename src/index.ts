console.log("> Rechnungsprogramm Start");
console.log("-------------------------");

import * as fs from "fs";
import moment from "moment";
import PdfPrinter from "pdfmake";
import { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { exit } from "process";

enum Vat {
  reverse,
  kleinunternehmer,
}

type Supplier = {
  name: string;
  address: string;
  cp: string;
  city: string;
  country: string;
  tel: string;
  mail: string;
  short: string;
  ustid: string;
  bank: {
    name: string;
    iban: string;
    bic: string;
  };
};
type Customer = {
  name: string;
  address: string;
  cp: string;
  city: string;
  country: string;
  mail: string;
  id: string;
  vat: Vat;
};
type Invoice = {
  number: string;
  creationDate: string;
  executionDate: string;
};
type Order = {
  list: Product[];
  date: string;
  total: number;
  currency: string;
};
type Product = {
  description: string;
  unit: string;
  amount: number;
  price: number;
  total: number;
};

const supplier: Supplier = {
  name: "Demo",
  address: "add",
  cp: "cp",
  city: "city",
  country: "country",
  tel: "Tel: +49 00",
  mail: "Mail: demo@gmail.com",
  short: "Demo - add - cp city - country",
  ustid: "DEXXX",
  bank: {
    name: "Bankname",
    iban: "DE00 00 00 00",
    bic: "CSCSCSC",
  },
};

const customer: Customer = {
  name: "Customer",
  address: "add",
  cp: "cp",
  city: "city",
  country: "country",
  mail: "demo@customer.de",
  id: "UID: DDXXXX",
  vat: Vat.reverse,
};

const order: Order = {
  list: [
    {
      description: "Musikberatung",
      unit: "Stück",
      amount: 10,
      price: 30,
      total: 300,
    },
    {
      description: "Grundlegende Musikberatung",
      unit: "Stück",
      amount: 5,
      price: 15,
      total: 75,
    },
  ],
  date: "7.12.2022",
  total: 375,
  currency: "€",
};

moment.locale("de");
const today = new Date();
const creationDate = moment(today).format("DD.MM.YYYY");
const executionDate = moment(new Date(order.date)).format("MMM YYYY"); // REVIEW
const invoiceNumber = moment(today).format("YYYYMM") + "XX";

const invoice: Invoice = {
  number: invoiceNumber,
  creationDate: creationDate,
  executionDate: executionDate,
};

generateInvoice();

function generateInvoice() {
  // Check that prices are calculated correctly
  let acc = 0;
  order.list.forEach((product) => {
    const sum = product.amount * product.price;
    acc += sum;
    if (sum != product.total) {
      console.error("A product price is wrong! " + sum + " != " + order.total);
      exit(1);
    }
  });
  if (acc !== order.total) {
    console.error("The total price is wrong! " + acc + " != " + order.total);
    exit(1);
  }

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
  order.list.forEach((product) => {
    rows.push([
      {
        text: product.description,
        style: "itemDescription",
      },
      {
        text: product.amount.toString(),
        style: "itemNumber",
      },
      {
        text: product.unit,
        style: "itemNumber",
      },
      {
        text: product.price.toFixed(2).replace(".", ",") + " " + order.currency,
        style: "itemNumber",
      },
      {
        text: product.total.toFixed(2).replace(".", ",") + " " + order.currency,
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
      text: order.total.toFixed(2).replace(".", ",") + " " + order.currency,
      style: "itemTotal",
    },
  ]);

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
              supplier.bank.name,
              "\nIBAN: ",
              supplier.bank.iban,
              "\nBIC: ",
              supplier.bank.bic,
            ],
            fontSize: 8.6,
            margin: [47.5, 0, 0, 0],
            //  style: "documentFooterLeft"
          },
          // { text: "FOOTER CENTER", style: "documentFooterCenter" },
          {
            text: [supplier.name, "\n", "USt-IdNr.: ", supplier.ustid],
            // style: "documentFooterRight",
            width: 180,
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
            text: supplier.name,
            alignment: "right",
            fontSize: 12,
          },
          {
            text: [
              supplier.address,
              "\n",
              supplier.cp,
              "\n",
              supplier.tel,
              "\n",
              supplier.mail,
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
            text: supplier.short,
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
          customer.name,
          "\n",
          customer.address,
          "\n",
          customer.cp,
          "\n",
          customer.country,
          "\n",
          customer.id,
          "\n",
        ],
      },
      // Line breaks
      "\n",

      // Invoice data
      {
        text: [
          "Rechnungs-Nr.: ",
          { text: invoice.number.toString(), bold: true },
          "\n",
          "Rechnungsdatum: ",
          { text: invoice.creationDate, bold: true },
          "\n",
          "Leistungsdatum: ",
          { text: invoice.executionDate, bold: true },
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
          checkVat(customer.vat),
          "Bitte überweisen Sie den Rechnungsbetrag innerhalb von 14 tagen.\n\n\n",
          "Ich danke Ihnen für die gute Zusammenarbeit.\n",
          "Mit freundlichen Grüßen,\n\n",
          supplier.name,
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
  pdfDoc.pipe(fs.createWriteStream("./out/" + invoiceNumber + ".pdf"));
  pdfDoc.end();
}

function checkVat(vat: Vat): string {
  switch (vat) {
    case Vat.reverse:
      return "Reverse Charge: Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.\n\n";
    case Vat.kleinunternehmer:
      return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.\n\n";
    default:
      break;
  }
}
