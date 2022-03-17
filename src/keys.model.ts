export enum ProductKeys {
  id = "Product Id",
  description = "Product Description DE",
  unit = "Product Unit",
}

export enum OrderKeys {
  // paid = "Paid",
  run = "Run",
  invoiceId = "Invoice ID",
  invoiceDate = "Invoice Date",
  executionDate = "Execution Date",
  customerId = "Customer",
  // total = "Total",
}

// Prefixes of the item keys, the suffix is an increasing number
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

// Type definition: https://stackoverflow.com/questions/39701524/using-enum-as-interface-key-in-typescript
// Usage: https://stackoverflow.com/questions/36316326/typescript-ts7015-error-when-accessing-an-enum-using-a-string-type-parameter
// Mapped type additional property: https://stackoverflow.com/questions/67390147/ts1170-error-with-mapped-type-when-a-new-property-is-added

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
