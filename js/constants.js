export const STORAGE_KEY = "kakeibo-app-data";
export const RESTORE_SAFETY_KEY = "kakeibo-app-data-restore-safety";
export const SCHEMA_VERSION = 1;

export const TRANSACTION_TYPES = Object.freeze({
  INCOME: "income",
  EXPENSE: "expense",
});

export const TRANSACTION_SOURCES = Object.freeze({
  MANUAL: "manual",
  SUBSCRIPTION: "subscription",
});

const initialCategoryDefinitions = [
  {
    id: "category-income",
    name: "収入",
    transactionType: TRANSACTION_TYPES.INCOME,
    subcategories: [
      ["subcategory-income-part-time", "バイト給与"],
      ["subcategory-income-temporary", "臨時収入"],
      ["subcategory-income-other", "その他"],
    ],
  },
  {
    id: "category-expense-game",
    name: "ゲーム",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [
      ["subcategory-game-genshin", "原神"],
      ["subcategory-game-dq-walk", "ドラクエウォーク"],
      ["subcategory-game-purchase", "ゲーム購入"],
    ],
  },
  {
    id: "category-expense-subscription",
    name: "サブスク",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [
      ["subcategory-subscription-chatgpt", "ChatGPT"],
      ["subcategory-subscription-amazon-prime", "Amazon Prime"],
      ["subcategory-subscription-fanbox", "FANBOX"],
      ["subcategory-subscription-google-photos", "Googleフォト"],
      ["subcategory-subscription-icloud", "iCloud+"],
      ["subcategory-subscription-other", "その他"],
    ],
  },
  {
    id: "category-expense-food",
    name: "食費",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [
      ["subcategory-food-convenience", "コンビニ"],
      ["subcategory-food-dining-out", "外食"],
      ["subcategory-food-supermarket", "スーパー"],
      ["subcategory-food-cafe", "カフェ"],
      ["subcategory-food-drink", "飲み物"],
    ],
  },
  {
    id: "category-expense-gadget",
    name: "PC・ガジェット",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [
      ["subcategory-gadget-pc-parts", "PCパーツ"],
      ["subcategory-gadget-peripherals", "周辺機器"],
      ["subcategory-gadget-desk", "デスク環境"],
    ],
  },
  {
    id: "category-expense-study",
    name: "勉強",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [
      ["subcategory-study-university", "大学"],
      ["subcategory-study-qualification", "資格"],
      ["subcategory-study-other", "その他"],
    ],
  },
  {
    id: "category-expense-transport",
    name: "交通費",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [
      ["subcategory-transport-train", "電車"],
      ["subcategory-transport-bus", "バス"],
    ],
  },
  {
    id: "category-expense-medical",
    name: "医療",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [["subcategory-medical", "医療"]],
  },
  {
    id: "category-expense-shopping",
    name: "買い物",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [["subcategory-shopping", "買い物"]],
  },
  {
    id: "category-expense-other",
    name: "その他",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    subcategories: [["subcategory-expense-other", "その他"]],
  },
];

const initialPaymentMethodDefinitions = [
  ["payment-chibagin", "ちばぎん"],
  ["payment-chibagin-debit", "ちばぎんデビット"],
  ["payment-paypay", "PayPay"],
  ["payment-paypal", "PayPal"],
  ["payment-cash", "現金"],
  ["payment-other", "その他"],
];

export function createInitialCategories(timestamp) {
  return initialCategoryDefinitions.map((category, categoryIndex) => ({
    id: category.id,
    name: category.name,
    transactionType: category.transactionType,
    order: categoryIndex,
    createdAt: timestamp,
    subcategories: category.subcategories.map(([id, name], subcategoryIndex) => ({
      id,
      name,
      order: subcategoryIndex,
      createdAt: timestamp,
    })),
  }));
}

export function createInitialPaymentMethods(timestamp) {
  return initialPaymentMethodDefinitions.map(([id, name], order) => ({
    id,
    name,
    order,
    createdAt: timestamp,
  }));
}
