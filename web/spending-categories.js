"use strict";

const CATEGORY_VERSION = 2;

const CATEGORY_LABELS = {
  income: "Income",
  transfer: "Transfers",
  delivery: "Delivery",
  groceries: "Groceries",
  dining: "Dining",
  transport: "Transport",
  utilities: "Utilities",
  subscriptions: "Subscriptions",
  shopping: "Shopping",
  health: "Health",
  taxes: "Taxes",
  cash: "Cash",
  fees: "Bank fees",
  travel: "Travel",
  housing: "Housing",
  entertainment: "Entertainment",
  insurance: "Insurance",
  education: "Education",
  pets: "Pets",
  business: "Business",
  other: "Other",
};

// Specific merchants come before broad categories to avoid hiding useful detail.
const TEXT_CATEGORY_RULES = [
  ["transfer", /μεταφορ|μεταξυ|μτφ|transfer|between accounts|instant trans|revolut|payzy|iris|πλ\.?\s*καρτας|πληρωμη\s+καρτας|europhone/],
  ["delivery", /\bwolt\b|e[ -]?food|efood|box[ .-]?gr|delivery[ .-]?gr/],
  ["groceries", /supermarket|σουπερ|market in|σκλαβενιτ|αβ βασιλ|lidl|mymarket|masout|galaxias/],
  ["dining", /restaurant|cafe|coffee|καφε|εστια|mcdonald|everest|gregory|pizza fan|domino/],
  ["transport", /fuel|βενζιν|shell|\bbp\b|ελιν|eko|aegean oil|taxi|uber|free now|oasa|attiki odos|naodos|epass|parking/],
  ["utilities", /dei|δεη|electric|water|eydap|ευδαπ|cosmote|vodafone|nova|τηλεφων|energy|natural gas/],
  ["subscriptions", /netflix|spotify|youtube|apple\.com|google storage|icloud|adobe|openai|anthropic|perplexity|itunes|app ?store|subscription/],
  ["shopping", /amazon|skroutz|\bpublic\b|plaisio|jumbo|zara|h&m|ikea|temu|\bshop\b|\bstore\b/],
  ["health", /pharmacy|φαρμακ|doctor|ιατρ|hospital|clinic|διαγνωσ/],
  ["taxes", /aade|ααδε|\btax\b|φορο|efka|εφκα|government|δημοσ/],
  ["cash", /\batm\b|cash withdrawal|αναληψη/],
  ["fees", /\bfee\b|commission|προμηθεια|bank charge|εξοδα instant trans/],
  ["travel", /airbnb|booking\.com|\bhotel\b|aegean airlines|ryanair|sky express|ferry|\bflight\b/],
  ["housing", /\brent\b|ενοικ|κοινοχρηστ|building expense/],
  ["entertainment", /cinema|theater|steam|playstation|ticket|σινεμα|θεατρο/],
  ["insurance", /insurance|ασφαλισ|interamerican|ethniki asfal|eurolife|allianz/],
  ["education", /school|σχολ|tuition|φροντιστ|udemy|coursera/],
  ["pets", /pet city|pet shop|κτηνιατρ|veterinar/],
  ["business", /facebk|facebook|meta ads|google ads|adwords|porkbun|namecheap|godaddy|papaki|top\.host|fastpath|\bτπυ\b/],
];

const MCC_CATEGORY_MAP = new Map([
  ["0742", "pets"],
  ["4111", "transport"],
  ["4121", "transport"],
  ["4131", "transport"],
  ["4511", "travel"],
  ["4722", "travel"],
  ["4814", "utilities"],
  ["4899", "utilities"],
  ["4900", "utilities"],
  ["5411", "groceries"],
  ["5422", "groceries"],
  ["5441", "groceries"],
  ["5451", "groceries"],
  ["5462", "groceries"],
  ["5499", "groceries"],
  ["5541", "transport"],
  ["5542", "transport"],
  ["5812", "dining"],
  ["5814", "dining"],
  ["5912", "health"],
  ["5995", "pets"],
  ["6010", "cash"],
  ["6011", "cash"],
  ["6300", "insurance"],
  ["7011", "travel"],
  ["7523", "transport"],
  ["7832", "entertainment"],
  ["8211", "education"],
  ["8220", "education"],
  ["8299", "education"],
]);

function categorizeTransaction(transaction = {}) {
  if (Number(transaction.amount) > 0) return "income";
  const text = transactionSearchText(transaction);
  const textMatch = TEXT_CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
  if (textMatch) return textMatch[0];

  const merchantCategoryCode = String(transaction.merchantCategoryCode || "").replace(/\D/g, "");
  if (MCC_CATEGORY_MAP.has(merchantCategoryCode)) {
    return MCC_CATEGORY_MAP.get(merchantCategoryCode);
  }
  return "other";
}

function transactionSearchText(transaction) {
  const bankCode = transaction.bankTransactionCode || {};
  const original = normalizeText([
    transaction.description,
    transaction.counterparty,
    bankCode.description,
    bankCode.code,
    bankCode.subCode,
  ].filter(Boolean).join(" "));
  return `${original} ${foldGreekLookalikes(original)}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function foldGreekLookalikes(value) {
  const lookalikes = {
    α: "a",
    β: "b",
    ε: "e",
    η: "h",
    ι: "i",
    κ: "k",
    μ: "m",
    ν: "n",
    ο: "o",
    ρ: "p",
    τ: "t",
    υ: "y",
    χ: "x",
  };
  return [...String(value || "")].map(character => lookalikes[character] || character).join("");
}

module.exports = {
  CATEGORY_LABELS,
  CATEGORY_VERSION,
  categorizeTransaction,
  normalizeText,
  transactionSearchText,
};
