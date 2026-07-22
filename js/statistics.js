import { TRANSACTION_SOURCES, TRANSACTION_TYPES } from "./constants.js";

const GAME_CATEGORY_ID = "category-expense-game";

export const STAT_PERIODS = Object.freeze({
  CURRENT_MONTH: "current-month",
  PREVIOUS_MONTH: "previous-month",
  CURRENT_YEAR: "current-year",
  ALL: "all",
});

export const STAT_AXES = Object.freeze({
  CATEGORY: "category",
  GAME: "game",
  PAYMENT_METHOD: "payment-method",
});

export function calculateCurrentBalance(appData) {
  const baseline = appData.balanceBaseline;
  if (!baseline) return null;

  return appData.transactions.reduce((balance, transaction) => {
    if (transaction.date <= baseline.date) return balance;
    return transaction.type === TRANSACTION_TYPES.INCOME
      ? balance + transaction.amount
      : balance - transaction.amount;
  }, baseline.amount);
}

export function calculateMonthlySummary(appData, year, monthIndex) {
  const transactions = getTransactionsForMonth(appData.transactions, year, monthIndex);
  const summary = {
    income: 0,
    expense: 0,
    net: 0,
    gameExpense: 0,
    subscriptionExpense: 0,
  };

  transactions.forEach((transaction) => {
    if (transaction.type === TRANSACTION_TYPES.INCOME) {
      summary.income += transaction.amount;
      return;
    }

    summary.expense += transaction.amount;
    if (transaction.categoryId === GAME_CATEGORY_ID) summary.gameExpense += transaction.amount;
    if (transaction.source === TRANSACTION_SOURCES.SUBSCRIPTION) summary.subscriptionExpense += transaction.amount;
  });

  summary.net = summary.income - summary.expense;
  return summary;
}

export function getTransactionsForMonth(transactions, year, monthIndex) {
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  return transactions.filter((transaction) => transaction.date.startsWith(monthPrefix));
}

export function isCurrentMonth(year, monthIndex, today = new Date()) {
  return year === today.getFullYear() && monthIndex === today.getMonth();
}

export function shiftMonth(year, monthIndex, amount) {
  const date = new Date(year, monthIndex + amount, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function calculateExpenseBreakdown(appData, period, axis, today = new Date()) {
  const periodExpenses = getExpenseTransactionsForPeriod(appData.transactions, period, today);
  const targetTransactions = axis === STAT_AXES.GAME
    ? periodExpenses.filter((transaction) => transaction.categoryId === GAME_CATEGORY_ID)
    : periodExpenses;
  const definitions = getAggregationDefinitions(appData, axis);
  const amounts = new Map();

  targetTransactions.forEach((transaction) => {
    const id = getAggregationId(transaction, axis);
    amounts.set(id, (amounts.get(id) ?? 0) + transaction.amount);
  });

  const total = [...amounts.values()].reduce((sum, amount) => sum + amount, 0);
  const items = definitions
    .map((definition) => ({
      id: definition.id,
      name: definition.name,
      amount: amounts.get(definition.id) ?? 0,
      order: definition.order,
      color: getStableChartColor(definition.id),
    }))
    .filter((item) => item.amount > 0)
    .sort((left, right) => {
      if (right.amount !== left.amount) return right.amount - left.amount;
      if (left.order !== right.order) return left.order - right.order;
      const nameComparison = left.name.localeCompare(right.name, "ja");
      return nameComparison !== 0 ? nameComparison : left.id.localeCompare(right.id);
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      percentage: total === 0 ? 0 : (item.amount / total) * 100,
      color: item.color,
    }));

  return {
    period,
    axis,
    total,
    items,
    transactionCount: targetTransactions.length,
  };
}

export function getExpenseTransactionsForPeriod(transactions, period, today = new Date()) {
  const { year, month } = getLocalDateParts(today);
  return transactions.filter((transaction) => {
    if (transaction.type !== TRANSACTION_TYPES.EXPENSE) return false;
    if (period === STAT_PERIODS.ALL) return true;
    if (period === STAT_PERIODS.CURRENT_YEAR) return transaction.date.startsWith(`${year}-`);
    if (period === STAT_PERIODS.CURRENT_MONTH) {
      return transaction.date.startsWith(`${year}-${String(month).padStart(2, "0")}-`);
    }
    if (period === STAT_PERIODS.PREVIOUS_MONTH) {
      const previousMonth = month === 1 ? 12 : month - 1;
      const previousYear = month === 1 ? year - 1 : year;
      return transaction.date.startsWith(`${previousYear}-${String(previousMonth).padStart(2, "0")}-`);
    }
    throw new TypeError(`未対応の集計期間です: ${period}`);
  });
}

export function getStableChartColor(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unsignedHash = hash >>> 0;
  const hue = (unsignedHash % 3600) / 10;
  const saturation = 58 + ((unsignedHash >>> 8) % 15);
  const lightness = 43 + ((unsignedHash >>> 16) % 12);
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

function getAggregationDefinitions(appData, axis) {
  if (axis === STAT_AXES.CATEGORY) {
    return appData.categories
      .filter((category) => category.transactionType === TRANSACTION_TYPES.EXPENSE)
      .map((category) => ({ id: category.id, name: category.name, order: category.order }));
  }
  if (axis === STAT_AXES.GAME) {
    const gameCategory = appData.categories.find((category) => category.id === GAME_CATEGORY_ID);
    return (gameCategory?.subcategories ?? []).map((subcategory) => ({
      id: subcategory.id,
      name: subcategory.name,
      order: subcategory.order,
    }));
  }
  if (axis === STAT_AXES.PAYMENT_METHOD) {
    return appData.paymentMethods.map((method) => ({ id: method.id, name: method.name, order: method.order }));
  }
  throw new TypeError(`未対応の集計方法です: ${axis}`);
}

function getAggregationId(transaction, axis) {
  if (axis === STAT_AXES.CATEGORY) return transaction.categoryId;
  if (axis === STAT_AXES.GAME) return transaction.subcategoryId;
  if (axis === STAT_AXES.PAYMENT_METHOD) return transaction.paymentMethodId;
  throw new TypeError(`未対応の集計方法です: ${axis}`);
}

function getLocalDateParts(today) {
  if (typeof today === "string") {
    const [year, month, day] = today.split("-").map(Number);
    return { year, month, day };
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
}
