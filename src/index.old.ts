console.log("> Rechnungsprogramm Start");
console.log("-------------------------");

import * as csv from "fast-csv";
import * as fs from "fs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as path from "path";

type RechnungRow = {
  date: string;
  name: string;
  net: string;
  currency: string;
  fromEmailAddress: string;
  transactionId: string;
};

function camelCase(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
}

fs.createReadStream(path.resolve(__dirname, "..", "in", "parse.csv"))
  .pipe(
    csv.parse({
      headers: (headerArray) => headerArray.map((header) => camelCase(header!)),
    })
  )
  .on("error", (error) => console.error(error))
  .on("data", (row: RechnungRow) => {
    // console.log(row);
    console.log(row.date);
    console.log(row.name);
    console.log(row.net);
    console.log(row.fromEmailAddress);
    console.log(row.transactionId);
    console.log("---------------");
    generateInvoice(row);
  })
  .on("end", (rowCount: number) => {
    console.log(`Parsed ${rowCount} rows`);
  });

function generateInvoice(data: RechnungRow) {
  const doc = new jsPDF();

  autoTable(doc, {
    body: [
      [
        {
          content: "Company brand",
          styles: {
            halign: "left",
            fontSize: 20,
            textColor: "#ffffff",
          },
        },
        {
          content: "Invoice",
          styles: {
            halign: "right",
            fontSize: 20,
            textColor: "#ffffff",
          },
        },
      ],
    ],
    theme: "plain",
    styles: {
      fillColor: "#3366ff",
    },
  });

  autoTable(doc, {
    body: [
      [
        {
          content:
            "Reference: #" +
            data.transactionId +
            "\nDate: " +
            data.date +
            "\nInvoice number: " +
            data.transactionId,
          styles: {
            halign: "right",
          },
        },
      ],
    ],
    theme: "plain",
  });

  autoTable(doc, {
    body: [
      [
        {
          content:
            "Billed to:" + "\n" + data.name + "\n" + data.fromEmailAddress,
          // "\nBilling Address line 2" +
          // "\nZip code - City" +
          // "\nCountry",
          styles: {
            halign: "left",
          },
        },
        // {
        //   content:
        //     "Shipping address:" +
        //     "\n" +
        //     data.name +
        //     "\nShipping Address line 1" +
        //     "\nShipping Address line 2" +
        //     "\nZip code - City" +
        //     "\nCountry",
        //   styles: {
        //     halign: "left",
        //   },
        // },
        {
          content:
            "From:" +
            "\nCompany name" +
            "\nShipping Address line 1" +
            "\nShipping Address line 2" +
            "\nZip code - City" +
            "\nCountry",
          styles: {
            halign: "right",
          },
        },
      ],
    ],
    theme: "plain",
  });

  autoTable(doc, {
    body: [
      [
        {
          content: "Amount due:",
          styles: {
            halign: "right",
            fontSize: 14,
          },
        },
      ],
      [
        {
          content: data.net + " " + data.currency,
          styles: {
            halign: "right",
            fontSize: 20,
            textColor: "#3366ff",
          },
        },
      ],
      [
        {
          content: "Due date: 2022-02-01",
          styles: {
            halign: "right",
          },
        },
      ],
    ],
    theme: "plain",
  });

  autoTable(doc, {
    body: [
      [
        {
          content: "Products & Services",
          styles: {
            halign: "left",
            fontSize: 14,
          },
        },
      ],
    ],
    theme: "plain",
  });

  autoTable(doc, {
    head: [["Items", "Category", "Quantity", "Price", "Tax", "Amount"]],
    body: [
      ["Product or service name", "Category", "2", "$450", "$50", "$1000"],
      ["Product or service name", "Category", "2", "$450", "$50", "$1000"],
      ["Product or service name", "Category", "2", "$450", "$50", "$1000"],
      ["Product or service name", "Category", "2", "$450", "$50", "$1000"],
    ],
    theme: "striped",
    headStyles: {
      fillColor: "#343a40",
    },
  });

  autoTable(doc, {
    body: [
      [
        {
          content: "Subtotal:",
          styles: {
            halign: "right",
          },
        },
        {
          content: "$3600",
          styles: {
            halign: "right",
          },
        },
      ],
      [
        {
          content: "Total tax:",
          styles: {
            halign: "right",
          },
        },
        {
          content: "$400",
          styles: {
            halign: "right",
          },
        },
      ],
      [
        {
          content: "Total amount:",
          styles: {
            halign: "right",
          },
        },
        {
          content: "$4000",
          styles: {
            halign: "right",
          },
        },
      ],
    ],
    theme: "plain",
  });

  autoTable(doc, {
    body: [
      [
        {
          content: "Terms & notes",
          styles: {
            halign: "left",
            fontSize: 14,
          },
        },
      ],
      [
        {
          content:
            "orem ipsum dolor sit amet consectetur adipisicing elit. Maxime mollitia" +
            "molestiae quas vel sint commodi repudiandae consequuntur voluptatum laborum" +
            "numquam blanditiis harum quisquam eius sed odit fugiat iusto fuga praesentium",
          styles: {
            halign: "left",
          },
        },
      ],
    ],
    theme: "plain",
  });

  autoTable(doc, {
    body: [
      [
        {
          content: "This is a centered footer",
          styles: {
            halign: "center",
          },
        },
      ],
    ],
    theme: "plain",
  });

  return doc.save("./out/" + data.transactionId + ".pdf");
}
