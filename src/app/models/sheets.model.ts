// Models based on the headers of each sheet tab

export enum ProductKeys {
  id = "Product Id",
  description = "Product Description DE",
  unit = "Product Unit",
}

export enum OrderKeys {
  run = "Run",
  invoiceId = "Invoice ID",
  invoiceDate = "Invoice Date",
  executionDate = "Execution Date",
  customerId = "Customer",
}

// Prefixes of the item keys, the suffix is an increasing number (1,2,3 ...)
export enum ItemPrefixKeys {
  productId = "Product ",
  amount = "Amount ",
  price = "Price ",
}

export enum CustomerKeys {
  id = "Customer Id",
  customerName = "Customer Name",
  businessName = "Business Name",
  address = "Address",
  cp = "CP",
  country = "Country",
  city = "City",
  vatId = "Vat ID",
  vatProcedure = "Vat Procedure",
}

export enum CompanyKeys {
  name = "Name",
  address = "Address",
  cp = "CP",
  city = "City",
  country = "Country",
  vatId = "Vat ID",
  telephone = "Telephone",
  mail = "Mail",
  bank = "Bank",
  iban = "IBAN",
  bic = "BIC",
}

export enum VatProcedure {
  reverseCharge = "Reverse Charge",
  kleinunternehmer = "Kleinunternehmerregelung",
}

type ProductKeysP = keyof typeof ProductKeys;
export type Product = { [key in ProductKeysP]?: string }; // Single product details

type ItemPrefixKeysP = keyof typeof ItemPrefixKeys;
export type Item = { [key in ItemPrefixKeysP]?: string }; // Item price and amount related to a product

type OrderKeysP = keyof typeof OrderKeys;
export type Order = {
  [key in OrderKeysP]?: string;
} & { items: Item[]; total?: string }; // Order details with list of items

type CustomerKeysP = keyof typeof CustomerKeys;
export type Customer = { [key in CustomerKeysP]?: string };

type CompanyKeysP = keyof typeof CompanyKeys;
export type Company = { [key in CompanyKeysP]?: string };
