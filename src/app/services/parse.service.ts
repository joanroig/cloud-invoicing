import { GoogleSpreadsheet } from "google-spreadsheet";
import moment from "moment";
import { Logger } from "../common/logger";
import Utils from "../common/utils";
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

const logger = Logger.getLogger("Parse");

moment.locale("de");

export async function parseProducts(doc: GoogleSpreadsheet) {
  const products = new Map<string, Product>();

  // Parse Products
  const sheet = doc.sheetsByTitle["Products"];
  const rows = await sheet.getRows();
  logger.info(`Parsing ${rows.length} products`);

  rows.forEach((row, rowIndex) => {
    const product: Product = {};
    Object.entries(ProductKeys).forEach(([key, tableKey]) => {
      if (!row[tableKey]) {
        Utils.throw(`Error: Missing product '${tableKey}' in row: ${rowIndex}`);
      }
      product[key as keyof typeof ProductKeys] = row[tableKey];
    });
    products.set(product.id, product);
  });
  return products;
}

export async function parseCustomers(doc: GoogleSpreadsheet) {
  const customers = new Map<string, Customer>();

  // Parse Customers
  const sheet = doc.sheetsByTitle["Customers"];
  const rows = await sheet.getRows();
  logger.info(`Parsing ${rows.length} customers`);

  rows.forEach((row, rowIndex) => {
    const customer: Customer = {};
    Object.entries(CustomerKeys).forEach(([key, tableKey]) => {
      if (!row[tableKey] && ![CustomerKeys.vatId].includes(tableKey)) {
        Utils.throw(
          `Error: Missing customer '${tableKey}' in row: ${rowIndex}`
        );
      }
      customer[key as keyof typeof CustomerKeys] = row[tableKey];
    });
    customers.set(customer.id, customer);
  });
  return customers;
}

export async function parseCompany(doc: GoogleSpreadsheet) {
  const company: Company = {};

  // Parse Company
  const sheet = doc.sheetsByTitle["Company"];
  const rows = await sheet.getRows();

  rows.forEach((row, rowIndex) => {
    Object.entries(CompanyKeys).forEach(([key, tableKey]) => {
      if (!row[tableKey]) {
        Utils.throw(`Error: Missing company '${tableKey}' in row: ${rowIndex}`);
      }
      company[key as keyof typeof CompanyKeys] = row[tableKey];
    });
  });
  return company;
}

export async function parseOrders(doc: GoogleSpreadsheet) {
  const orders: Order[] = [];

  const orderIds = new Set<string>();
  const invoiceRegistry = new Map<string, number>();
  const today = moment(new Date()).format("DD.MM.YYYY");

  // Parse Orders
  const sheet = doc.sheetsByTitle["Orders"];
  const rows = await sheet.getRows();
  logger.info(`Parsing ${rows.length} orders`);

  let previousInvoiceId = 0;
  let previousInvoiceDate: moment.Moment;

  for (const [rowIndex, row] of rows.entries()) {
    const order: Order = { items: [] };
    Object.entries(OrderKeys).forEach(([key, tableKey]) => {
      if (
        !row[tableKey] &&
        ![OrderKeys.invoiceId, OrderKeys.invoiceDate].includes(tableKey)
      ) {
        Utils.throw(`Error: Missing order '${tableKey}' in row: ${rowIndex}`);
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
        Utils.throw(
          `Error: Incomplete item '${productId}' '${amount}' '${price}' in row: ${rowIndex}`
        );
      }
    }

    // Check if the order prices are correct
    const sum = order.items.reduce((partialSum, a) => {
      const subtotal = Utils.euro(a.price).value * parseInt(a.amount);
      if (subtotal === 0) {
        Utils.throw(`Error: Subtotal is zero in row: ${rowIndex}`);
      }
      return partialSum + subtotal;
    }, 0);
    order.total = Utils.euro(sum).format();

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
        Utils.throw(`Error: More than 99 invoices in one month.`);
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
      Utils.throw(`Error: Duplicated invoice ID: ${order.invoiceId}`);
    }

    // Check if the invoice ID is greater than the previous
    if (previousInvoiceId > parseInt(order.invoiceId)) {
      Utils.throw(
        `Current invoice ID is lower than previous invoice: ${previousInvoiceId} > ${order.invoiceId}`
      );
    }
    previousInvoiceId = parseInt(order.invoiceId);

    // Check if the invoice date comes after the previous invoice
    const invoiceDate = moment(order.invoiceDate, "DD.MM.YYYY");
    if (previousInvoiceDate?.isAfter(invoiceDate)) {
      Utils.throw(
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
      // Wait to save the data into the sheet
      await row.save();
      orders.push(order);
    }
  }
  return orders;
}
