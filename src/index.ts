console.log("> Rechnungsprogramm Start");
console.log("-------------------------");

import * as csv from "fast-csv";
import * as fs from "fs";
import * as path from "path";

type RechnungRow = {
  date: string;
  name: string;
  fromEmailAddress: string;
};

function camelCase(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
}

fs.createReadStream(path.resolve(__dirname, "..", "assets", "parse.csv"))
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
    console.log(row.fromEmailAddress);
    console.log("---------------");
  })
  .on("end", (rowCount: number) => {
    console.log(`Parsed ${rowCount} rows`);
  });
