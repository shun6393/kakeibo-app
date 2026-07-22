import { STORAGE_KEY, TRANSACTION_SOURCES, TRANSACTION_TYPES } from "./constants.js";
import {
  downloadJsonBackup,
  downloadTransactionsCsv,
  parseAndValidateBackup,
} from "./backup.js";
import {
  DataFormatError,
  StorageError,
  loadAppData,
  resetAllAppData,
  saveAppData,
  saveRestoreSafetySnapshot,
} from "./storage.js";
import {
  createManualTransaction,
  findTransactionLabels,
  removeManualTransaction,
  sortTransactionsNewestFirst,
  updateManualTransaction,
  updateSubscriptionTransaction,
} from "./transactions.js";
import {
  SUBSCRIPTION_CYCLES,
  createSubscription,
  getLastSubscriptionOccurrence,
  getUpcomingSubscriptions,
  processDueSubscriptions,
  resumeSubscription,
  sortSubscriptionsForDisplay,
  stopSubscription,
  updateSubscription,
} from "./subscriptions.js";
import {
  STAT_AXES,
  STAT_PERIODS,
  calculateCurrentBalance,
  calculateExpenseBreakdown,
  calculateMonthlySummary,
  getTransactionsForMonth,
  isCurrentMonth,
  shiftMonth,
} from "./statistics.js";
import {
  destroyExpenseChart,
  destroyHomeExpenseChart,
  renderExpenseDoughnut,
  renderHomeExpenseDoughnut,
} from "./charts.js";
import { ValidationError, isValidDateString } from "./validation.js";
import { createCategory, createPaymentMethod, createSubcategory } from "./classifications.js";

const mainViews = new Set(["home", "history", "entry", "stats", "more"]);
const views = [...document.querySelectorAll("[data-view]")];
const navButtons = [...document.querySelectorAll(".bottom-nav [data-view-target]")];
const transactionForm = document.querySelector("#transaction-form");
const transactionFormError = document.querySelector("#transaction-form-error");
const transactionSubmit = document.querySelector("#transaction-submit");
const transactionEditCancel = document.querySelector("#transaction-edit-cancel");
const entryKicker = document.querySelector("#entry-kicker");
const entryTitle = document.querySelector("#entry-title");
const categorySelect = document.querySelector("#category-select");
const categoryLabel = document.querySelector("#category-label");
const subcategoryField = document.querySelector("#subcategory-field");
const subcategorySelect = document.querySelector("#subcategory-select");
const paymentLabel = document.querySelector("#payment-label");
const paymentMethodSelect = document.querySelector("#payment-method-select");

const balanceDialog = document.querySelector("#balance-dialog");
const balanceForm = document.querySelector("#balance-form");
const balanceFormError = document.querySelector("#balance-form-error");
const balanceDialogKicker = document.querySelector("#balance-dialog-kicker");
const balanceDialogTitle = document.querySelector("#balance-dialog-title");
const balanceSubmit = document.querySelector("#balance-submit");
const balanceConfirmDialog = document.querySelector("#baseline-confirm-dialog");
const balanceConfirmSummary = document.querySelector("#baseline-confirm-summary");
const balanceConfirmButton = document.querySelector("#baseline-confirm-button");
const balanceStatus = document.querySelector("#balance-status");
const balanceValue = document.querySelector("#balance-value");
const balanceNote = document.querySelector("#balance-note");
const balanceSetupButton = document.querySelector("#balance-setup-button");
const settingsBaselineSummary = document.querySelector("#settings-baseline-summary");
const baselineEditButton = document.querySelector("#baseline-edit-button");

const homeIncome = document.querySelector("#home-income");
const homeExpense = document.querySelector("#home-expense");
const homeNet = document.querySelector("#home-net");
const homeGameExpense = document.querySelector("#home-game-expense");
const homeSubscriptionExpense = document.querySelector("#home-subscription-expense");
const nextRenewalMessage = document.querySelector("#next-renewal-message");
const nextRenewalList = document.querySelector("#next-renewal-list");
const nextRenewalEmpty = document.querySelector("#next-renewal-empty");
const homeView = document.querySelector('[data-view="home"]');
const homeChartContainer = document.querySelector("#home-chart-container");
const homeChartCanvas = document.querySelector("#home-expense-chart");
const homeChartMessage = document.querySelector("#home-chart-message");
const homeBreakdownList = document.querySelector("#home-breakdown-list");

const statsView = document.querySelector('[data-view="stats"]');
const statsPeriodLabel = document.querySelector("#stats-period-label");
const statsChartTitle = document.querySelector("#chart-title");
const statsTotalLabel = document.querySelector("#stats-total-label");
const statsTotal = document.querySelector("#stats-total");
const statsChartContainer = document.querySelector("#stats-chart-container");
const statsChartCanvas = document.querySelector("#stats-chart");
const statsChartMessage = document.querySelector("#stats-chart-message");
const statsChartLegend = document.querySelector("#stats-chart-legend");
const statsBreakdownList = document.querySelector("#stats-breakdown-list");
const statsBreakdownEmpty = document.querySelector("#stats-breakdown-empty");

const historyList = document.querySelector("#transaction-list");
const historyEmptyState = document.querySelector("#history-empty-state");
const historyMonthLabel = document.querySelector("#history-month-label");
const historyPreviousMonth = document.querySelector("#history-previous-month");
const historyNextMonth = document.querySelector("#history-next-month");
const historyCurrentMonth = document.querySelector("#history-current-month");
const historyTypeFilter = document.querySelector("#history-type-filter");
const historyCategoryFilter = document.querySelector("#history-category-filter");

const subscriptionAddButton = document.querySelector("#subscription-add-button");
const subscriptionActiveTab = document.querySelector("#subscription-active-tab");
const subscriptionStoppedTab = document.querySelector("#subscription-stopped-tab");
const subscriptionList = document.querySelector("#subscription-list");
const subscriptionEmptyState = document.querySelector("#subscription-empty-state");
const subscriptionDialog = document.querySelector("#subscription-dialog");
const subscriptionForm = document.querySelector("#subscription-form");
const subscriptionFormError = document.querySelector("#subscription-form-error");
const subscriptionDialogKicker = document.querySelector("#subscription-dialog-kicker");
const subscriptionDialogTitle = document.querySelector("#subscription-dialog-title");
const subscriptionCategorySelect = document.querySelector("#subscription-category-select");
const subscriptionSubcategoryField = document.querySelector("#subscription-subcategory-field");
const subscriptionSubcategorySelect = document.querySelector("#subscription-subcategory-select");
const subscriptionPaymentMethodSelect = document.querySelector("#subscription-payment-method-select");
const subscriptionScheduleFields = document.querySelector("#subscription-schedule-fields");
const subscriptionEditCancel = document.querySelector("#subscription-edit-cancel");
const subscriptionSubmit = document.querySelector("#subscription-submit");
const subscriptionStopDialog = document.querySelector("#subscription-stop-dialog");
const subscriptionStopSummary = document.querySelector("#subscription-stop-summary");
const subscriptionStopError = document.querySelector("#subscription-stop-error");
const subscriptionStopConfirm = document.querySelector("#subscription-stop-confirm");
const subscriptionResumeDialog = document.querySelector("#subscription-resume-dialog");
const subscriptionResumeForm = document.querySelector("#subscription-resume-form");
const subscriptionResumeSummary = document.querySelector("#subscription-resume-summary");
const subscriptionResumeError = document.querySelector("#subscription-resume-error");

const categoryAddForm = document.querySelector("#category-add-form");
const categoryAddError = document.querySelector("#category-add-error");
const categoryCount = document.querySelector("#category-count");
const subcategoryAddForm = document.querySelector("#subcategory-add-form");
const subcategoryAddError = document.querySelector("#subcategory-add-error");
const subcategoryCount = document.querySelector("#subcategory-count");
const subcategoryParentSelect = document.querySelector("#subcategory-parent-select");
const paymentMethodAddForm = document.querySelector("#payment-method-add-form");
const paymentMethodAddError = document.querySelector("#payment-method-add-error");
const paymentMethodCount = document.querySelector("#payment-method-count");

const deleteDialog = document.querySelector("#delete-dialog");
const deleteTransactionSummary = document.querySelector("#delete-transaction-summary");
const deleteConfirmButton = document.querySelector("#delete-confirm-button");
const deleteError = document.querySelector("#delete-error");
const jsonBackupButton = document.querySelector("#json-backup-button");
const jsonRestoreButton = document.querySelector("#json-restore-button");
const jsonRestoreInput = document.querySelector("#json-restore-input");
const csvExportButton = document.querySelector("#csv-export-button");
const dataOperationError = document.querySelector("#data-operation-error");
const lastBackupStatus = document.querySelector("#last-backup-status");
const restorePreviewDialog = document.querySelector("#restore-preview-dialog");
const restoreSummary = document.querySelector("#restore-summary");
const restoreError = document.querySelector("#restore-error");
const restoreConfirmButton = document.querySelector("#restore-confirm-button");
const deleteAllOpenButton = document.querySelector("#delete-all-open-button");
const deleteAllWarningDialog = document.querySelector("#delete-all-warning-dialog");
const deleteAllBackupButton = document.querySelector("#delete-all-backup-button");
const deleteAllContinueButton = document.querySelector("#delete-all-continue-button");
const deleteAllConfirmDialog = document.querySelector("#delete-all-confirm-dialog");
const deleteAllConfirmationInput = document.querySelector("#delete-all-confirmation-input");
const deleteAllError = document.querySelector("#delete-all-error");
const deleteAllConfirmButton = document.querySelector("#delete-all-confirm-button");
const storageError = document.querySelector("#storage-error");
const storageErrorMessage = document.querySelector("#storage-error-message");
const toast = document.querySelector("#toast");

const today = new Date();
let appData = null;
let editingTransactionId = null;
let pendingDeleteId = null;
let pendingBaseline = null;
let pendingRestore = null;
let editingSubscriptionId = null;
let pendingStopSubscriptionId = null;
let pendingResumeSubscriptionId = null;
let showingActiveSubscriptions = true;
let selectedStatPeriod = STAT_PERIODS.CURRENT_MONTH;
let selectedStatAxis = STAT_AXES.CATEGORY;
let historyYear = today.getFullYear();
let historyMonthIndex = today.getMonth();
let toastTimer;

function showView(viewName) {
  const target = views.find((view) => view.dataset.view === viewName);
  if (!target) return;

  views.forEach((view) => {
    const isTarget = view === target;
    view.hidden = !isTarget;
    view.classList.toggle("is-active", isTarget);
  });

  const activeMainView = mainViews.has(viewName) ? viewName : "more";
  navButtons.forEach((button) => {
    const isActive = button.dataset.viewTarget === activeMainView;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (viewName === "history") renderHistory();
  if (viewName === "subscriptions") renderSubscriptions();
  if (viewName === "stats") renderStatistics();
  if (viewName === "home") renderHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function showFatalError(error) {
  const detail = error instanceof DataFormatError && error.details.length ? ` ${error.details[0]}` : "";
  storageErrorMessage.textContent = `${error.message}${detail}`;
  storageError.hidden = false;
  document.querySelectorAll("form input, form select, form button").forEach((control) => {
    control.disabled = true;
  });
}

function showFormError(element, error, form = null) {
  element.textContent = error.message;
  element.hidden = false;
  if (!form) return;

  form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
  if (!error.field) return;
  const control = form.elements[error.field];
  if (!control) return;
  const focusTarget = control instanceof RadioNodeList ? control[0] : control;
  focusTarget?.setAttribute("aria-invalid", "true");
  focusTarget?.focus();
}

function clearFormError(element, form = null) {
  element.hidden = true;
  element.textContent = "";
  form?.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
}

function populatePaymentMethods() {
  const selected = paymentMethodSelect.value;
  paymentMethodSelect.replaceChildren(new Option("選択してください", ""));
  [...appData.paymentMethods]
    .sort((left, right) => left.order - right.order)
    .forEach((method) => paymentMethodSelect.add(new Option(method.name, method.id)));
  paymentMethodSelect.value = appData.paymentMethods.some((method) => method.id === selected) ? selected : "";
}

function getSelectedTransactionType() {
  return transactionForm.elements["transaction-type"].value;
}

function updateTransactionFields() {
  if (!appData) return;
  const type = getSelectedTransactionType();
  const isIncome = type === TRANSACTION_TYPES.INCOME;
  const selectedCategoryValue = categorySelect.value;
  const selectedSubcategoryValue = subcategorySelect.value;
  const categories = appData.categories
    .filter((category) => category.transactionType === type)
    .sort((left, right) => left.order - right.order);

  categoryLabel.textContent = isIncome ? "収入カテゴリ" : "大カテゴリ";
  paymentLabel.textContent = isIncome ? "受取方法" : "支払い方法";
  categorySelect.replaceChildren(new Option("選択してください", ""));

  if (isIncome) {
    categories.forEach((category) => {
      if (category.id === "category-income") {
        [...category.subcategories]
          .sort((left, right) => left.order - right.order)
          .forEach((subcategory) => {
            const option = new Option(subcategory.name, subcategory.id);
            option.dataset.categoryId = category.id;
            option.dataset.subcategoryId = subcategory.id;
            categorySelect.add(option);
          });
        return;
      }
      const option = new Option(category.name, category.id);
      option.dataset.categoryId = category.id;
      categorySelect.add(option);
    });
  } else {
    categories.forEach((category) => {
      const option = new Option(category.name, category.id);
      option.dataset.categoryId = category.id;
      categorySelect.add(option);
    });
  }
  categorySelect.value = [...categorySelect.options].some((option) => option.value === selectedCategoryValue)
    ? selectedCategoryValue
    : "";
  updateSubcategoryField(selectedSubcategoryValue);
}

function updateSubcategoryField(preferredSubcategory = subcategorySelect.value) {
  if (!appData) return;
  const selectedOption = categorySelect.selectedOptions[0];
  const directSubcategoryId = selectedOption?.dataset.subcategoryId;
  const categoryId = selectedOption?.dataset.categoryId || categorySelect.value;
  const category = appData.categories.find((item) => item.id === categoryId);
  const options = [...(category?.subcategories ?? [])].sort((left, right) => left.order - right.order);
  subcategorySelect.replaceChildren();

  if (directSubcategoryId) {
    const subcategory = options.find((item) => item.id === directSubcategoryId);
    if (subcategory) subcategorySelect.add(new Option(subcategory.name, subcategory.id));
    subcategorySelect.value = directSubcategoryId;
    subcategorySelect.required = true;
    subcategoryField.hidden = true;
    return;
  }

  if (options.length === 0) {
    subcategorySelect.add(new Option("小カテゴリなし", ""));
    subcategorySelect.value = "";
    subcategorySelect.required = false;
    subcategoryField.hidden = true;
    return;
  }

  if (options.length === 1) {
    subcategorySelect.add(new Option(options[0].name, options[0].id));
    subcategorySelect.value = options[0].id;
    subcategorySelect.required = true;
    subcategoryField.hidden = true;
    return;
  }

  subcategoryField.hidden = false;
  subcategorySelect.required = options.length > 0;
  subcategorySelect.add(new Option(options.length ? "選択してください" : "大カテゴリを先に選択", ""));
  options.forEach((subcategory) => subcategorySelect.add(new Option(subcategory.name, subcategory.id)));
  subcategorySelect.value = options.some((subcategory) => subcategory.id === preferredSubcategory)
    ? preferredSubcategory
    : "";
}

function renderAll() {
  populatePaymentMethods();
  updateTransactionFields();
  populateSubscriptionOptions();
  renderCategoryManagement();
  renderHome();
  populateHistoryCategoryFilter();
  renderHistory();
  renderSettingsBaseline();
  renderLastBackupStatus();
  renderSubscriptions();
  renderStatistics();
}

function renderCategoryManagement() {
  const selectedParent = subcategoryParentSelect.value;
  subcategoryParentSelect.replaceChildren(new Option("選択してください", ""));

  [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE].forEach((type) => {
    const group = document.createElement("optgroup");
    group.label = type === TRANSACTION_TYPES.INCOME ? "収入用" : "支出用";
    appData.categories
      .filter((category) => category.transactionType === type)
      .sort((left, right) => left.order - right.order)
      .forEach((category) => group.append(new Option(category.name, category.id)));
    subcategoryParentSelect.append(group);
  });
  subcategoryParentSelect.value = appData.categories.some((category) => category.id === selectedParent)
    ? selectedParent
    : "";

  categoryCount.textContent = `${appData.categories.length}件`;
  subcategoryCount.textContent = `${appData.categories.reduce((total, category) => total + category.subcategories.length, 0)}件`;
  paymentMethodCount.textContent = `${appData.paymentMethods.length}件`;
}

function renderLastBackupStatus() {
  const lastBackupAt = appData.settings.lastBackupAt;
  lastBackupStatus.textContent = lastBackupAt
    ? `最終JSONバックアップ：${formatDateTime(lastBackupAt)}`
    : "最終JSONバックアップ：未実施";
}

function clearDataOperationError() {
  dataOperationError.hidden = true;
  dataOperationError.textContent = "";
}

function showDataOperationError(error, target = dataOperationError) {
  console.error(error);
  const detail = error instanceof DataFormatError && error.details.length ? ` ${error.details[0]}` : "";
  target.textContent = `${error.message ?? "処理に失敗しました。もう一度お試しください。"}${detail}`;
  target.hidden = false;
}

function startJsonBackup(filenamePrefix = "kakeibo-backup") {
  clearDataOperationError();
  const exportedAt = new Date().toISOString();
  const nextData = cloneData(appData);
  nextData.settings.lastBackupAt = exportedAt;
  downloadJsonBackup(nextData, filenamePrefix, exportedAt);
  appData = saveAppData(nextData);
  renderLastBackupStatus();
  showToast("バックアップファイルのダウンロードを開始しました");
}

function renderRestoreSummary(summary) {
  const rows = [
    ["バックアップ作成日時", formatDateTime(summary.exportedAt)],
    ["schemaVersion", String(summary.schemaVersion)],
    ["初期残高", summary.hasBalanceBaseline ? "設定あり" : "未設定"],
    ["取引件数", `${summary.transactionCount}件`],
    ["サブスク件数", `${summary.subscriptionCount}件`],
    ["カテゴリ件数", `${summary.categoryCount}件`],
    ["支払い・受取方法件数", `${summary.paymentMethodCount}件`],
  ];
  restoreSummary.replaceChildren();
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    restoreSummary.append(term, description);
  });
}

function resetUiAfterDataReplacement() {
  pendingDeleteId = null;
  pendingBaseline = null;
  editingTransactionId = null;
  editingSubscriptionId = null;
  pendingStopSubscriptionId = null;
  pendingResumeSubscriptionId = null;
  showingActiveSubscriptions = true;
  historyYear = today.getFullYear();
  historyMonthIndex = today.getMonth();
  historyTypeFilter.value = "all";
  historyCategoryFilter.value = "all";
  populatePaymentMethods();
  resetTransactionForm();
  renderAll();
}

function renderHome() {
  const baseline = appData.balanceBaseline;
  const currentBalance = calculateCurrentBalance(appData);
  const summary = calculateMonthlySummary(appData, today.getFullYear(), today.getMonth());

  if (!baseline) {
    balanceStatus.textContent = "未設定";
    balanceValue.textContent = "— 円";
    balanceValue.classList.remove("is-negative");
    balanceNote.textContent = "基準日終了時点の残高から計算します";
    balanceSetupButton.hidden = false;
  } else {
    balanceStatus.textContent = "現在";
    balanceValue.textContent = formatYen(currentBalance);
    balanceValue.classList.toggle("is-negative", currentBalance < 0);
    balanceNote.textContent = `基準残高 ${formatYen(baseline.amount)}（${formatDate(baseline.date)}終了時点）`;
    balanceSetupButton.hidden = true;
  }

  homeIncome.textContent = formatYen(summary.income);
  homeExpense.textContent = formatYen(summary.expense);
  homeNet.textContent = formatSignedYen(summary.net);
  homeGameExpense.textContent = formatYen(summary.gameExpense);
  homeSubscriptionExpense.textContent = formatYen(summary.subscriptionExpense);

  renderNextRenewals();
  renderHomeExpenseBreakdown();
}

function renderNextRenewals() {
  const subscriptions = getUpcomingSubscriptions(appData.subscriptions, 3);
  nextRenewalList.replaceChildren();
  subscriptions.forEach((subscription) => {
    const item = document.createElement("article");
    item.className = "renewal-item";
    item.setAttribute("role", "listitem");
    const name = document.createElement("span");
    name.className = "renewal-item-name";
    name.textContent = subscription.name;
    const date = document.createElement("span");
    date.className = "renewal-item-date";
    date.textContent = `次回更新：${formatDate(subscription.nextBillingDate)}`;
    const amount = document.createElement("strong");
    amount.className = "renewal-item-amount";
    amount.textContent = formatYen(subscription.amount);
    item.append(name, date, amount);
    nextRenewalList.append(item);
  });
  nextRenewalList.hidden = subscriptions.length === 0;
  nextRenewalEmpty.hidden = subscriptions.length > 0;
  nextRenewalMessage.textContent = "サブスク未登録";
}

function renderHomeExpenseBreakdown() {
  const result = calculateExpenseBreakdown(appData, STAT_PERIODS.CURRENT_MONTH, STAT_AXES.CATEGORY, today);
  homeBreakdownList.replaceChildren();
  result.items.slice(0, 5).forEach((item) => homeBreakdownList.append(createBreakdownRow(item)));

  if (result.items.length === 0) {
    destroyHomeExpenseChart();
    homeChartContainer.hidden = true;
    homeBreakdownList.hidden = true;
    homeChartMessage.hidden = false;
    homeChartMessage.querySelector("p").textContent = "今月の支出はありません";
    return;
  }

  homeBreakdownList.hidden = false;
  if (homeView.hidden) {
    destroyHomeExpenseChart();
    homeChartContainer.hidden = true;
    homeChartMessage.hidden = true;
    return;
  }

  const chartRendered = renderHomeExpenseDoughnut(homeChartCanvas, result.items, result.total);
  homeChartContainer.hidden = !chartRendered;
  homeChartMessage.hidden = chartRendered;
  if (!chartRendered) {
    homeChartMessage.querySelector("p").textContent = "グラフを読み込めませんでした。上位一覧は確認できます。";
  }
}

function renderStatistics() {
  if (!appData) return;
  const periodLabels = {
    [STAT_PERIODS.CURRENT_MONTH]: "今月",
    [STAT_PERIODS.PREVIOUS_MONTH]: "先月",
    [STAT_PERIODS.CURRENT_YEAR]: "今年",
    [STAT_PERIODS.ALL]: "全期間",
  };
  const axisLabels = {
    [STAT_AXES.CATEGORY]: "大カテゴリ別支出",
    [STAT_AXES.GAME]: "ゲーム別支出",
    [STAT_AXES.PAYMENT_METHOD]: "支払い方法別支出",
  };
  const result = calculateExpenseBreakdown(appData, selectedStatPeriod, selectedStatAxis, today);
  const periodLabel = periodLabels[selectedStatPeriod];

  document.querySelectorAll("[data-stat-period]").forEach((button) => {
    const isSelected = button.dataset.statPeriod === selectedStatPeriod;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  document.querySelectorAll("[data-stat-axis]").forEach((button) => {
    const isSelected = button.dataset.statAxis === selectedStatAxis;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  });

  statsPeriodLabel.textContent = periodLabel;
  statsChartTitle.textContent = axisLabels[selectedStatAxis];
  statsTotalLabel.textContent = selectedStatAxis === STAT_AXES.GAME
    ? `${periodLabel}のゲーム支出合計`
    : `${periodLabel}の支出合計`;
  statsTotal.textContent = formatYen(result.total);
  statsChartCanvas.setAttribute("aria-label", `${periodLabel}の${axisLabels[selectedStatAxis]}ドーナツグラフ`);

  statsChartLegend.replaceChildren();
  statsBreakdownList.replaceChildren();
  result.items.forEach((item) => {
    const legendItem = document.createElement("span");
    legendItem.className = "chart-legend-item";
    const legendName = document.createElement("span");
    legendName.textContent = item.name;
    legendItem.append(createChartColorChip(item.color), legendName);
    statsChartLegend.append(legendItem);

    statsBreakdownList.append(createBreakdownRow(item));
  });

  if (result.items.length === 0) {
    destroyExpenseChart();
    statsChartContainer.hidden = true;
    statsChartLegend.hidden = true;
    statsBreakdownList.hidden = true;
    statsBreakdownEmpty.hidden = false;
    statsChartMessage.hidden = false;
    statsChartMessage.querySelector(".chart-ring").hidden = false;
    const emptyMessage = selectedStatAxis === STAT_AXES.GAME
      ? "この期間のゲーム支出はありません"
      : "この期間の支出はありません";
    statsChartMessage.querySelector("p").textContent = emptyMessage;
    statsBreakdownEmpty.querySelector("p").textContent = emptyMessage;
    return;
  }

  statsChartLegend.hidden = false;
  statsBreakdownList.hidden = false;
  statsBreakdownEmpty.hidden = true;

  if (statsView.hidden) {
    destroyExpenseChart();
    statsChartContainer.hidden = true;
    statsChartMessage.hidden = true;
    return;
  }

  const chartRendered = renderExpenseDoughnut(statsChartCanvas, result.items, result.total);
  statsChartContainer.hidden = !chartRendered;
  statsChartMessage.hidden = chartRendered;
  if (!chartRendered) {
    statsChartMessage.querySelector(".chart-ring").hidden = true;
    statsChartMessage.querySelector("p").textContent = "グラフを読み込めませんでした。金額・割合一覧は確認できます。";
  }
}

function createChartColorChip(color) {
  const chip = document.createElement("span");
  chip.className = "chart-color-chip";
  chip.style.backgroundColor = color;
  chip.setAttribute("aria-hidden", "true");
  return chip;
}

function createBreakdownRow(item) {
  const row = document.createElement("div");
  row.className = "breakdown-item";
  const name = document.createElement("span");
  name.className = "breakdown-name";
  name.textContent = item.name;
  const values = document.createElement("span");
  values.className = "breakdown-values";
  const amount = document.createElement("strong");
  amount.textContent = formatYen(item.amount);
  const percentage = document.createElement("span");
  percentage.textContent = `${item.percentage.toFixed(1)}%`;
  values.append(amount, percentage);
  row.append(createChartColorChip(item.color), name, values);
  return row;
}

function renderSettingsBaseline() {
  const baseline = appData.balanceBaseline;
  settingsBaselineSummary.textContent = baseline
    ? `${formatDate(baseline.date)}終了時点・${formatYen(baseline.amount)}`
    : "未設定です。";
  baselineEditButton.textContent = baseline ? "訂正" : "設定";
}

function renderSubscriptions() {
  if (!appData) return;
  const subscriptions = sortSubscriptionsForDisplay(appData.subscriptions, showingActiveSubscriptions);
  subscriptionActiveTab.classList.toggle("is-active", showingActiveSubscriptions);
  subscriptionActiveTab.setAttribute("aria-selected", String(showingActiveSubscriptions));
  subscriptionStoppedTab.classList.toggle("is-active", !showingActiveSubscriptions);
  subscriptionStoppedTab.setAttribute("aria-selected", String(!showingActiveSubscriptions));
  subscriptionList.replaceChildren();

  if (subscriptions.length === 0) {
    subscriptionList.hidden = true;
    subscriptionEmptyState.hidden = false;
    subscriptionEmptyState.querySelector("h3").textContent = showingActiveSubscriptions
      ? "利用中のサブスクはありません"
      : "停止中のサブスクはありません";
    subscriptionEmptyState.querySelector("p").textContent = showingActiveSubscriptions
      ? "毎月・毎年の支払いを登録すると、更新日に自動計上します。"
      : "停止したサブスクはここに表示されます。";
    return;
  }

  subscriptionList.hidden = false;
  subscriptionEmptyState.hidden = true;
  subscriptions.forEach((subscription) => subscriptionList.append(createSubscriptionElement(subscription)));
}

function createSubscriptionElement(subscription) {
  const labels = findTransactionLabels(subscription, appData);
  const article = document.createElement("article");
  article.className = "subscription-card";
  article.dataset.subscriptionId = subscription.id;

  const heading = document.createElement("div");
  heading.className = "subscription-card-heading";
  const name = document.createElement("h3");
  name.textContent = subscription.name;
  const cycle = document.createElement("span");
  cycle.className = "subscription-cycle";
  cycle.textContent = subscription.cycle === SUBSCRIPTION_CYCLES.MONTHLY ? "毎月" : "毎年";
  heading.append(name, cycle);

  const amount = document.createElement("p");
  amount.className = "subscription-amount";
  amount.textContent = formatYen(subscription.amount);
  const details = document.createElement("div");
  details.className = "subscription-details";
  const classification = document.createElement("span");
  classification.textContent = formatClassificationLabels(labels);
  const statusDate = document.createElement("span");
  if (subscription.active) {
    statusDate.textContent = `次回更新：${formatDate(subscription.nextBillingDate)}`;
  } else {
    const lastOccurrence = getLastSubscriptionOccurrence(subscription.id, appData.transactions);
    statusDate.textContent = `停止：${formatDateTime(subscription.stoppedAt)}${lastOccurrence ? `・最終計上：${formatDate(lastOccurrence)}` : "・計上履歴なし"}`;
  }
  details.append(classification, statusDate);

  const actions = document.createElement("div");
  actions.className = "subscription-card-actions";
  const editButton = createSubscriptionActionButton("編集", "edit", subscription.id);
  const stateButton = createSubscriptionActionButton(
    subscription.active ? "停止" : "再開",
    subscription.active ? "stop" : "resume",
    subscription.id,
  );
  stateButton.classList.add(subscription.active ? "is-stop" : "is-resume");
  actions.append(editButton, stateButton);
  article.append(heading, amount, details, actions);
  return article;
}

function createSubscriptionActionButton(label, action, subscriptionId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "subscription-action";
  button.dataset.subscriptionAction = action;
  button.dataset.subscriptionId = subscriptionId;
  button.textContent = label;
  return button;
}

function populateSubscriptionOptions() {
  const selectedCategory = subscriptionCategorySelect.value;
  subscriptionCategorySelect.replaceChildren(new Option("選択してください", ""));
  appData.categories
    .filter((category) => category.transactionType === TRANSACTION_TYPES.EXPENSE)
    .sort((left, right) => left.order - right.order)
    .forEach((category) => subscriptionCategorySelect.add(new Option(category.name, category.id)));
  subscriptionCategorySelect.value = appData.categories.some((category) => category.id === selectedCategory)
    ? selectedCategory
    : "";

  const selectedPayment = subscriptionPaymentMethodSelect.value;
  subscriptionPaymentMethodSelect.replaceChildren(new Option("選択してください", ""));
  [...appData.paymentMethods]
    .sort((left, right) => left.order - right.order)
    .forEach((method) => subscriptionPaymentMethodSelect.add(new Option(method.name, method.id)));
  subscriptionPaymentMethodSelect.value = appData.paymentMethods.some((method) => method.id === selectedPayment)
    ? selectedPayment
    : "";
  updateSubscriptionSubcategories();
}

function updateSubscriptionSubcategories() {
  const category = appData.categories.find((item) => item.id === subscriptionCategorySelect.value);
  const options = [...(category?.subcategories ?? [])].sort((left, right) => left.order - right.order);
  const selected = subscriptionSubcategorySelect.value;
  subscriptionSubcategorySelect.replaceChildren();

  if (options.length === 0) {
    subscriptionSubcategorySelect.add(new Option("小カテゴリなし", ""));
    subscriptionSubcategorySelect.value = "";
    subscriptionSubcategorySelect.required = false;
    subscriptionSubcategoryField.hidden = true;
    return;
  }

  if (options.length === 1) {
    subscriptionSubcategorySelect.add(new Option(options[0].name, options[0].id));
    subscriptionSubcategorySelect.value = options[0].id;
    subscriptionSubcategorySelect.required = true;
    subscriptionSubcategoryField.hidden = true;
    return;
  }

  subscriptionSubcategoryField.hidden = false;
  subscriptionSubcategorySelect.required = true;
  subscriptionSubcategorySelect.add(new Option(options.length ? "選択してください" : "大カテゴリを先に選択", ""));
  options.forEach((subcategory) => subscriptionSubcategorySelect.add(new Option(subcategory.name, subcategory.id)));
  subscriptionSubcategorySelect.value = options.some((subcategory) => subcategory.id === selected) ? selected : "";
}

function openSubscriptionDialog(subscriptionId = null) {
  editingSubscriptionId = subscriptionId;
  subscriptionForm.reset();
  clearFormError(subscriptionFormError, subscriptionForm);
  populateSubscriptionOptions();
  const subscription = subscriptionId ? appData.subscriptions.find((item) => item.id === subscriptionId) : null;
  const isStoppedEdit = subscription && !subscription.active;

  subscriptionDialogKicker.textContent = subscription ? "EDIT SUBSCRIPTION" : "NEW SUBSCRIPTION";
  subscriptionDialogTitle.textContent = subscription ? "サブスクを編集" : "サブスクを登録";
  subscriptionSubmit.textContent = subscription ? "変更を保存" : "登録する";
  subscriptionEditCancel.hidden = !subscription;
  subscriptionScheduleFields.hidden = Boolean(isStoppedEdit);
  subscriptionForm.elements.cycle.disabled = Boolean(isStoppedEdit);
  subscriptionForm.elements["next-billing-date"].disabled = Boolean(isStoppedEdit);

  if (subscription) {
    subscriptionForm.elements.name.value = subscription.name;
    subscriptionForm.elements.amount.value = String(subscription.amount);
    subscriptionCategorySelect.value = subscription.categoryId;
    updateSubscriptionSubcategories();
    subscriptionSubcategorySelect.value = subscription.subcategoryId;
    subscriptionPaymentMethodSelect.value = subscription.paymentMethodId;
    subscriptionForm.elements.cycle.value = subscription.cycle;
    subscriptionForm.elements["next-billing-date"].value = subscription.nextBillingDate;
  } else {
    subscriptionForm.elements.cycle.value = SUBSCRIPTION_CYCLES.MONTHLY;
    subscriptionForm.elements["next-billing-date"].value = getLocalToday();
  }
  subscriptionDialog.showModal();
}

function getSubscriptionInputFromForm() {
  const existing = editingSubscriptionId
    ? appData.subscriptions.find((subscription) => subscription.id === editingSubscriptionId)
    : null;
  return {
    name: subscriptionForm.elements.name.value,
    amount: Number(subscriptionForm.elements.amount.value),
    categoryId: subscriptionCategorySelect.value,
    subcategoryId: subscriptionSubcategorySelect.value || null,
    paymentMethodId: subscriptionPaymentMethodSelect.value,
    cycle: existing && !existing.active ? existing.cycle : subscriptionForm.elements.cycle.value,
    nextBillingDate:
      existing && !existing.active ? existing.nextBillingDate : subscriptionForm.elements["next-billing-date"].value,
  };
}

function populateHistoryCategoryFilter() {
  const selected = historyCategoryFilter.value || "all";
  const type = historyTypeFilter.value || "all";
  const categories = appData.categories
    .filter((category) => type === "all" || category.transactionType === type)
    .sort((left, right) => {
      if (left.transactionType !== right.transactionType) return left.transactionType === TRANSACTION_TYPES.INCOME ? -1 : 1;
      return left.order - right.order;
    });

  historyCategoryFilter.replaceChildren(new Option("すべて", "all"));
  categories.forEach((category) => historyCategoryFilter.add(new Option(category.name, category.id)));
  historyCategoryFilter.value = categories.some((category) => category.id === selected) ? selected : "all";
}

function renderHistory() {
  if (!appData) return;
  historyMonthLabel.textContent = `${historyYear}年${historyMonthIndex + 1}月${isCurrentMonth(historyYear, historyMonthIndex) ? "（今月）" : ""}`;
  historyCurrentMonth.hidden = isCurrentMonth(historyYear, historyMonthIndex);

  const type = historyTypeFilter.value || "all";
  const categoryId = historyCategoryFilter.value || "all";
  const transactions = sortTransactionsNewestFirst(
    getTransactionsForMonth(appData.transactions, historyYear, historyMonthIndex).filter((transaction) => {
      if (type !== "all" && transaction.type !== type) return false;
      return categoryId === "all" || transaction.categoryId === categoryId;
    }),
  );

  historyList.replaceChildren();
  if (transactions.length === 0) {
    historyList.hidden = true;
    historyEmptyState.hidden = false;
    historyEmptyState.querySelector("h3").textContent = "この月の取引はありません";
    historyEmptyState.querySelector("p").textContent = "対象月や絞り込み条件を変更するか、新しい収支を登録してください。";
    return;
  }

  historyList.hidden = false;
  historyEmptyState.hidden = true;
  let currentDate = null;
  let group = null;

  transactions.forEach((transaction) => {
    if (transaction.date !== currentDate) {
      currentDate = transaction.date;
      group = document.createElement("section");
      group.className = "transaction-group";
      const dateHeading = document.createElement("h3");
      dateHeading.className = "transaction-date";
      dateHeading.textContent = formatDate(transaction.date);
      group.append(dateHeading);
      historyList.append(group);
    }
    group.append(createTransactionElement(transaction));
  });
}

function createTransactionElement(transaction) {
  const labels = findTransactionLabels(transaction, appData);
  const isIncome = transaction.type === TRANSACTION_TYPES.INCOME;
  const article = document.createElement("article");
  article.className = `transaction-item${isIncome ? " is-income" : " is-expense"}`;
  article.dataset.transactionId = transaction.id;

  const marker = document.createElement("span");
  marker.className = "transaction-marker";
  marker.setAttribute("aria-hidden", "true");
  const main = document.createElement("div");
  main.className = "transaction-main";
  const title = document.createElement("p");
  title.className = "transaction-title";
  title.textContent = getTransactionDisplayTitle(transaction, labels);
  const meta = document.createElement("p");
  meta.className = "transaction-meta";
  meta.textContent = formatClassificationLabels(labels);
  if (transaction.source === TRANSACTION_SOURCES.SUBSCRIPTION) {
    const badge = document.createElement("span");
    badge.className = "transaction-source-badge";
    badge.textContent = "自動・サブスク";
    meta.append(badge);
  }
  main.append(title, meta);
  const amount = document.createElement("strong");
  amount.className = "transaction-amount";
  amount.textContent = `${isIncome ? "+" : "−"}${formatYen(transaction.amount)}`;
  article.append(marker, main, amount);

  if ([TRANSACTION_SOURCES.MANUAL, TRANSACTION_SOURCES.SUBSCRIPTION].includes(transaction.source)) {
    const actions = document.createElement("div");
    actions.className = "transaction-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "transaction-action";
    editButton.dataset.transactionAction = "edit";
    editButton.dataset.transactionId = transaction.id;
    editButton.textContent = "編集";
    actions.append(editButton);
    if (transaction.source === TRANSACTION_SOURCES.MANUAL) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "transaction-action is-delete";
      deleteButton.dataset.transactionAction = "delete";
      deleteButton.dataset.transactionId = transaction.id;
      deleteButton.textContent = "削除";
      actions.append(deleteButton);
    }
    article.append(actions);
  }

  return article;
}

function resetTransactionForm() {
  editingTransactionId = null;
  transactionForm.reset();
  transactionForm.elements.date.value = getLocalToday();
  entryKicker.textContent = "新しい記録";
  entryTitle.textContent = "収支登録";
  transactionSubmit.textContent = "この内容で登録";
  transactionEditCancel.hidden = true;
  [...transactionForm.elements["transaction-type"]].forEach((radio) => { radio.disabled = false; });
  transactionForm.elements.date.disabled = false;
  transactionForm.elements.title.disabled = false;
  clearFormError(transactionFormError, transactionForm);
  updateTransactionFields();
}

function startTransactionEdit(transactionId) {
  const transaction = appData.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;

  editingTransactionId = transaction.id;
  transactionForm.elements["transaction-type"].value = transaction.type;
  updateTransactionFields();
  transactionForm.elements.date.value = transaction.date;
  transactionForm.elements.amount.value = String(transaction.amount);
  transactionForm.elements.title.value = transaction.title;

  const directIncomeOption = transaction.type === TRANSACTION_TYPES.INCOME
    ? [...categorySelect.options].find((option) =>
      option.dataset.categoryId === transaction.categoryId && option.dataset.subcategoryId === transaction.subcategoryId
    )
    : null;
  categorySelect.value = directIncomeOption?.value ?? transaction.categoryId;
  updateSubcategoryField(transaction.subcategoryId);
  paymentMethodSelect.value = transaction.paymentMethodId;
  const isSubscription = transaction.source === TRANSACTION_SOURCES.SUBSCRIPTION;
  [...transactionForm.elements["transaction-type"]].forEach((radio) => { radio.disabled = isSubscription; });
  transactionForm.elements.date.disabled = isSubscription;
  transactionForm.elements.title.disabled = isSubscription;
  entryKicker.textContent = isSubscription ? "自動計上の分類・金額を変更" : "登録内容を変更";
  entryTitle.textContent = isSubscription ? "サブスク支出を編集" : "収支を編集";
  transactionSubmit.textContent = "変更を保存";
  transactionEditCancel.hidden = false;
  clearFormError(transactionFormError, transactionForm);
  showView("entry");
}

function getTransactionInputFromForm() {
  const type = getSelectedTransactionType();
  const selectedOption = categorySelect.selectedOptions[0];
  return {
    type,
    date: transactionForm.elements.date.value,
    amount: Number(transactionForm.elements.amount.value),
    title: transactionForm.elements.title.value,
    categoryId: selectedOption?.dataset.categoryId || categorySelect.value,
    subcategoryId: selectedOption?.dataset.subcategoryId || subcategorySelect.value || null,
    paymentMethodId: paymentMethodSelect.value,
  };
}

function setHistoryMonthFromDate(dateString) {
  const [year, month] = dateString.split("-").map(Number);
  historyYear = year;
  historyMonthIndex = month - 1;
  historyTypeFilter.value = "all";
  historyCategoryFilter.value = "all";
  populateHistoryCategoryFilter();
}

function openBalanceDialog() {
  const baseline = appData.balanceBaseline;
  clearFormError(balanceFormError, balanceForm);
  balanceForm.elements["baseline-date"].value = baseline?.date ?? getLocalToday();
  balanceForm.elements["baseline-amount"].value = baseline ? String(baseline.amount) : "";
  balanceDialogKicker.textContent = baseline ? "CORRECTION" : "FIRST SETUP";
  balanceDialogTitle.textContent = baseline ? "初期残高・基準日を訂正" : "初期残高を設定";
  balanceSubmit.textContent = baseline ? "変更内容を確認" : "設定する";
  balanceDialog.showModal();
}

function saveBaseline(baseline) {
  const nextData = cloneData(appData);
  const timestamp = new Date().toISOString();
  nextData.balanceBaseline = {
    amount: baseline.amount,
    date: baseline.date,
    createdAt: appData.balanceBaseline?.createdAt ?? timestamp,
  };
  appData = saveAppData(nextData);
  renderAll();
}

function openDeleteDialog(transactionId) {
  const transaction = appData.transactions.find((item) => item.id === transactionId);
  if (!transaction || transaction.source !== TRANSACTION_SOURCES.MANUAL) return;
  pendingDeleteId = transaction.id;
  clearFormError(deleteError);
  const labels = findTransactionLabels(transaction, appData);
  deleteTransactionSummary.textContent = `${formatDate(transaction.date)}\n${getTransactionDisplayTitle(transaction, labels)}\n${transaction.type === TRANSACTION_TYPES.INCOME ? "+" : "−"}${formatYen(transaction.amount)}`;
  deleteDialog.showModal();
}

function openSubscriptionStopDialog(subscriptionId) {
  const subscription = appData.subscriptions.find((item) => item.id === subscriptionId);
  if (!subscription?.active) return;
  pendingStopSubscriptionId = subscriptionId;
  clearFormError(subscriptionStopError);
  subscriptionStopSummary.textContent = `${subscription.name}\n${formatYen(subscription.amount)}・${subscription.cycle === SUBSCRIPTION_CYCLES.MONTHLY ? "毎月" : "毎年"}\n次回更新：${formatDate(subscription.nextBillingDate)}`;
  subscriptionStopDialog.showModal();
}

function openSubscriptionResumeDialog(subscriptionId) {
  const subscription = appData.subscriptions.find((item) => item.id === subscriptionId);
  if (!subscription || subscription.active) return;
  pendingResumeSubscriptionId = subscriptionId;
  subscriptionResumeForm.reset();
  clearFormError(subscriptionResumeError, subscriptionResumeForm);
  subscriptionResumeSummary.textContent = `${subscription.name}\n${formatYen(subscription.amount)}・${subscription.cycle === SUBSCRIPTION_CYCLES.MONTHLY ? "毎月" : "毎年"}`;
  subscriptionResumeForm.elements["resume-date"].min = getLocalToday();
  subscriptionResumeForm.elements["resume-date"].value = getLocalToday();
  subscriptionResumeDialog.showModal();
}

function handleStorageError(error, errorElement = transactionFormError, form = transactionForm) {
  if (error instanceof ValidationError || error instanceof StorageError || error instanceof DataFormatError) {
    showFormError(errorElement, error, form);
    return true;
  }
  return false;
}

function initializeApp() {
  try {
    appData = loadAppData().data;
    let autoPostingResult = null;
    try {
      autoPostingResult = processDueSubscriptions(appData, getLocalToday());
      if (autoPostingResult.processedOccurrenceCount > 0) {
        appData = saveAppData(autoPostingResult.data);
      }
    } catch (error) {
      console.error("サブスク自動計上に失敗しました。", error);
      storageErrorMessage.textContent = `${error.message} 元データは変更していません。バックアップを取得して内容を確認してください。`;
      storageError.hidden = false;
    }
    populatePaymentMethods();
    resetTransactionForm();
    historyTypeFilter.value = "all";
    populateHistoryCategoryFilter();
    renderAll();
    if (appData.balanceBaseline === null) window.setTimeout(openBalanceDialog, 0);
    if (autoPostingResult?.generatedCount > 0) {
      window.setTimeout(() => showToast(`サブスク支出を${autoPostingResult.generatedCount}件自動計上しました`), 0);
    }
  } catch (error) {
    if (error instanceof StorageError || error instanceof DataFormatError) {
      showFatalError(error);
      return;
    }
    throw error;
  }
}

document.addEventListener("click", (event) => {
  const statPeriodButton = event.target.closest("[data-stat-period]");
  if (statPeriodButton) {
    selectedStatPeriod = statPeriodButton.dataset.statPeriod;
    renderStatistics();
    return;
  }

  const statAxisButton = event.target.closest("[data-stat-axis]");
  if (statAxisButton) {
    selectedStatAxis = statAxisButton.dataset.statAxis;
    renderStatistics();
    return;
  }

  const subscriptionAction = event.target.closest("[data-subscription-action]");
  if (subscriptionAction) {
    const subscriptionId = subscriptionAction.dataset.subscriptionId;
    if (subscriptionAction.dataset.subscriptionAction === "edit") openSubscriptionDialog(subscriptionId);
    if (subscriptionAction.dataset.subscriptionAction === "stop") openSubscriptionStopDialog(subscriptionId);
    if (subscriptionAction.dataset.subscriptionAction === "resume") openSubscriptionResumeDialog(subscriptionId);
    return;
  }

  const transactionAction = event.target.closest("[data-transaction-action]");
  if (transactionAction) {
    if (transactionAction.dataset.transactionAction === "edit") startTransactionEdit(transactionAction.dataset.transactionId);
    if (transactionAction.dataset.transactionAction === "delete") openDeleteDialog(transactionAction.dataset.transactionId);
    return;
  }

  const viewButton = event.target.closest("[data-view-target]");
  if (viewButton) {
    showView(viewButton.dataset.viewTarget);
    return;
  }

  const dialogButton = event.target.closest("[data-dialog-open]");
  if (dialogButton?.dataset.dialogOpen === "balance-dialog") {
    openBalanceDialog();
    return;
  }

  const dialogCloseButton = event.target.closest("[data-dialog-close]");
  if (dialogCloseButton) {
    document.querySelector(`#${dialogCloseButton.dataset.dialogClose}`)?.close();
    return;
  }

  const messageButton = event.target.closest("[data-ui-message]");
  if (messageButton) {
    showToast(messageButton.dataset.uiMessage);
    return;
  }

  const chip = event.target.closest(".chip");
  if (chip) {
    chip.parentElement.querySelectorAll(".chip").forEach((item) => item.classList.remove("is-selected"));
    chip.classList.add("is-selected");
    showToast("集計処理は後続ステップで実装します");
    return;
  }

  const tab = event.target.closest(".tabs button");
  if (tab) {
    tab.parentElement.querySelectorAll("button").forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
  }
});

historyPreviousMonth.addEventListener("click", () => {
  ({ year: historyYear, monthIndex: historyMonthIndex } = shiftMonth(historyYear, historyMonthIndex, -1));
  renderHistory();
});

historyNextMonth.addEventListener("click", () => {
  ({ year: historyYear, monthIndex: historyMonthIndex } = shiftMonth(historyYear, historyMonthIndex, 1));
  renderHistory();
});

historyCurrentMonth.addEventListener("click", () => {
  historyYear = today.getFullYear();
  historyMonthIndex = today.getMonth();
  renderHistory();
});

historyTypeFilter.addEventListener("change", () => {
  populateHistoryCategoryFilter();
  renderHistory();
});

historyCategoryFilter.addEventListener("change", renderHistory);

subscriptionAddButton.addEventListener("click", () => openSubscriptionDialog());

subscriptionActiveTab.addEventListener("click", () => {
  showingActiveSubscriptions = true;
  renderSubscriptions();
});

subscriptionStoppedTab.addEventListener("click", () => {
  showingActiveSubscriptions = false;
  renderSubscriptions();
});

subscriptionCategorySelect.addEventListener("change", () => {
  clearFormError(subscriptionFormError, subscriptionForm);
  updateSubscriptionSubcategories();
});

subscriptionForm.addEventListener("change", () => clearFormError(subscriptionFormError, subscriptionForm));

subscriptionEditCancel.addEventListener("click", () => {
  editingSubscriptionId = null;
  subscriptionDialog.close();
});

subscriptionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormError(subscriptionFormError, subscriptionForm);

  try {
    const input = getSubscriptionInputFromForm();
    const nextData = cloneData(appData);
    const wasEditing = Boolean(editingSubscriptionId);
    if (editingSubscriptionId) {
      const updated = updateSubscription(editingSubscriptionId, input, appData);
      nextData.subscriptions = nextData.subscriptions.map((subscription) =>
        subscription.id === editingSubscriptionId ? updated : subscription,
      );
    } else {
      nextData.subscriptions.push(createSubscription(input, appData));
    }

    const autoPosting = processDueSubscriptions(nextData, getLocalToday());
    appData = saveAppData(autoPosting.data);
    editingSubscriptionId = null;
    subscriptionDialog.close();
    renderAll();
    showView("subscriptions");
    const baseMessage = wasEditing ? "サブスクを更新しました" : "サブスクを登録しました";
    showToast(autoPosting.generatedCount ? `${baseMessage}（${autoPosting.generatedCount}件自動計上）` : baseMessage);
  } catch (error) {
    if (!handleStorageError(error, subscriptionFormError, subscriptionForm)) throw error;
  }
});

subscriptionStopConfirm.addEventListener("click", () => {
  if (!pendingStopSubscriptionId) return;
  clearFormError(subscriptionStopError);
  try {
    const autoPosting = processDueSubscriptions(appData, getLocalToday());
    const stopped = stopSubscription(pendingStopSubscriptionId, autoPosting.data);
    autoPosting.data.subscriptions = autoPosting.data.subscriptions.map((subscription) =>
      subscription.id === stopped.id ? stopped : subscription,
    );
    appData = saveAppData(autoPosting.data);
    pendingStopSubscriptionId = null;
    subscriptionStopDialog.close();
    renderAll();
    showToast(autoPosting.generatedCount ? `更新分を${autoPosting.generatedCount}件計上して停止しました` : "サブスクを停止しました");
  } catch (error) {
    if (!handleStorageError(error, subscriptionStopError, null)) throw error;
  }
});

subscriptionResumeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingResumeSubscriptionId) return;
  clearFormError(subscriptionResumeError, subscriptionResumeForm);
  try {
    const resumed = resumeSubscription(
      pendingResumeSubscriptionId,
      subscriptionResumeForm.elements["resume-date"].value,
      appData,
      getLocalToday(),
    );
    const nextData = cloneData(appData);
    nextData.subscriptions = nextData.subscriptions.map((subscription) =>
      subscription.id === resumed.id ? resumed : subscription,
    );
    const autoPosting = processDueSubscriptions(nextData, getLocalToday());
    appData = saveAppData(autoPosting.data);
    pendingResumeSubscriptionId = null;
    showingActiveSubscriptions = true;
    subscriptionResumeDialog.close();
    renderAll();
    showToast(autoPosting.generatedCount ? "サブスクを再開し、当日分を自動計上しました" : "サブスクを再開しました");
  } catch (error) {
    if (!handleStorageError(error, subscriptionResumeError, subscriptionResumeForm)) throw error;
  }
});

categoryAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormError(categoryAddError, categoryAddForm);
  try {
    const nextData = cloneData(appData);
    nextData.categories.push(createCategory({
      name: categoryAddForm.elements["category-name"].value,
      transactionType: categoryAddForm.elements["category-type"].value,
    }, appData));
    appData = saveAppData(nextData);
    categoryAddForm.elements["category-name"].value = "";
    renderAll();
    showToast("大カテゴリを追加しました");
  } catch (error) {
    if (!handleStorageError(error, categoryAddError, categoryAddForm)) throw error;
  }
});

subcategoryAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormError(subcategoryAddError, subcategoryAddForm);
  try {
    const categoryId = subcategoryParentSelect.value;
    const subcategory = createSubcategory({
      categoryId,
      name: subcategoryAddForm.elements["subcategory-name"].value,
    }, appData);
    const nextData = cloneData(appData);
    const parent = nextData.categories.find((category) => category.id === categoryId);
    parent.subcategories.push(subcategory);
    parent.updatedAt = subcategory.updatedAt;
    appData = saveAppData(nextData);
    subcategoryAddForm.elements["subcategory-name"].value = "";
    renderAll();
    subcategoryParentSelect.value = categoryId;
    showToast("小カテゴリを追加しました");
  } catch (error) {
    if (!handleStorageError(error, subcategoryAddError, subcategoryAddForm)) throw error;
  }
});

paymentMethodAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFormError(paymentMethodAddError, paymentMethodAddForm);
  try {
    const nextData = cloneData(appData);
    nextData.paymentMethods.push(createPaymentMethod({
      name: paymentMethodAddForm.elements["payment-method-name"].value,
    }, appData));
    appData = saveAppData(nextData);
    paymentMethodAddForm.elements["payment-method-name"].value = "";
    renderAll();
    showToast("支払い・受取方法を追加しました");
  } catch (error) {
    if (!handleStorageError(error, paymentMethodAddError, paymentMethodAddForm)) throw error;
  }
});

[categoryAddForm, subcategoryAddForm, paymentMethodAddForm].forEach((form) => {
  form.addEventListener("input", () => {
    const errorElement = form === categoryAddForm
      ? categoryAddError
      : form === subcategoryAddForm
        ? subcategoryAddError
        : paymentMethodAddError;
    clearFormError(errorElement, form);
  });
});

transactionForm.addEventListener("change", (event) => {
  clearFormError(transactionFormError, transactionForm);
  if (event.target.name === "transaction-type") updateTransactionFields();
  if (event.target === categorySelect) updateSubcategoryField();
});

transactionEditCancel.addEventListener("click", () => {
  resetTransactionForm();
  showView("history");
});

transactionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!appData) return;
  clearFormError(transactionFormError, transactionForm);

  try {
    const input = getTransactionInputFromForm();
    const nextData = cloneData(appData);
    let savedTransaction;

    if (editingTransactionId) {
      const existing = appData.transactions.find((transaction) => transaction.id === editingTransactionId);
      savedTransaction = existing?.source === TRANSACTION_SOURCES.SUBSCRIPTION
        ? updateSubscriptionTransaction(editingTransactionId, input, appData)
        : updateManualTransaction(editingTransactionId, input, appData);
      nextData.transactions = nextData.transactions.map((transaction) =>
        transaction.id === editingTransactionId ? savedTransaction : transaction,
      );
    } else {
      savedTransaction = createManualTransaction(input, appData);
      nextData.transactions.push(savedTransaction);
    }

    const wasEditing = Boolean(editingTransactionId);
    appData = saveAppData(nextData);
    setHistoryMonthFromDate(savedTransaction.date);
    resetTransactionForm();
    renderAll();
    showView("history");
    showToast(wasEditing ? "取引を更新しました" : "収支を登録しました");
  } catch (error) {
    if (!handleStorageError(error)) throw error;
  }
});

balanceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!appData) return;
  clearFormError(balanceFormError, balanceForm);
  const date = balanceForm.elements["baseline-date"].value;
  const amount = Number(balanceForm.elements["baseline-amount"].value);

  try {
    if (!isValidDateString(date)) throw new ValidationError("有効な基準日を入力してください。", "baseline-date");
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new ValidationError("初期残高は1円以上の整数で入力してください。", "baseline-amount");
    }

    if (appData.balanceBaseline) {
      pendingBaseline = { amount, date };
      balanceConfirmSummary.textContent = `変更前：${formatDate(appData.balanceBaseline.date)}・${formatYen(appData.balanceBaseline.amount)}\n変更後：${formatDate(date)}・${formatYen(amount)}`;
      balanceDialog.close();
      balanceConfirmDialog.showModal();
      return;
    }

    saveBaseline({ amount, date });
    balanceDialog.close();
    showToast("初期残高を保存しました");
  } catch (error) {
    if (!handleStorageError(error, balanceFormError, balanceForm)) throw error;
  }
});

balanceConfirmButton.addEventListener("click", () => {
  if (!pendingBaseline) return;
  try {
    saveBaseline(pendingBaseline);
    pendingBaseline = null;
    balanceConfirmDialog.close();
    showToast("初期残高と基準日を変更しました");
  } catch (error) {
    balanceConfirmDialog.close();
    if (!handleStorageError(error, balanceFormError, balanceForm)) throw error;
    balanceDialog.showModal();
  }
});

deleteConfirmButton.addEventListener("click", () => {
  if (!pendingDeleteId) return;
  clearFormError(deleteError);
  try {
    const nextData = cloneData(appData);
    nextData.transactions = removeManualTransaction(pendingDeleteId, appData);
    appData = saveAppData(nextData);
    pendingDeleteId = null;
    deleteDialog.close();
    renderAll();
    showToast("取引を削除しました");
  } catch (error) {
    if (!handleStorageError(error, deleteError, null)) throw error;
  }
});

jsonBackupButton.addEventListener("click", () => {
  try {
    startJsonBackup();
  } catch (error) {
    showDataOperationError(error);
  }
});

jsonRestoreButton.addEventListener("click", () => {
  clearDataOperationError();
  jsonRestoreInput.value = "";
  jsonRestoreInput.click();
});

jsonRestoreInput.addEventListener("change", async () => {
  clearDataOperationError();
  pendingRestore = null;
  const file = jsonRestoreInput.files?.[0];
  if (!file) return;

  try {
    const result = parseAndValidateBackup(await file.text());
    pendingRestore = result;
    renderRestoreSummary(result.summary);
    clearFormError(restoreError);
    restorePreviewDialog.showModal();
  } catch (error) {
    showDataOperationError(error);
  }
});

restoreConfirmButton.addEventListener("click", () => {
  if (!pendingRestore) return;
  clearFormError(restoreError);

  try {
    saveRestoreSafetySnapshot(appData);
    downloadJsonBackup(appData, "kakeibo-before-restore");
    const restoredAutoPosting = processDueSubscriptions(pendingRestore.data, getLocalToday());
    appData = saveAppData(restoredAutoPosting.data);
    pendingRestore = null;
    restorePreviewDialog.close();
    resetUiAfterDataReplacement();
    showView("home");
    showToast(
      restoredAutoPosting.generatedCount > 0
        ? `復元し、サブスク支出を${restoredAutoPosting.generatedCount}件自動計上しました`
        : "バックアップからデータを復元しました",
    );
    if (appData.balanceBaseline === null) window.setTimeout(openBalanceDialog, 0);
  } catch (error) {
    showDataOperationError(error, restoreError);
  }
});

csvExportButton.addEventListener("click", () => {
  clearDataOperationError();
  try {
    const result = downloadTransactionsCsv(appData);
    showToast(`CSVのダウンロードを開始しました（${result.transactionCount}件）`);
  } catch (error) {
    showDataOperationError(error);
  }
});

deleteAllOpenButton.addEventListener("click", () => {
  clearDataOperationError();
  deleteAllWarningDialog.showModal();
});

deleteAllBackupButton.addEventListener("click", () => {
  try {
    startJsonBackup();
  } catch (error) {
    deleteAllWarningDialog.close();
    showDataOperationError(error);
  }
});

deleteAllContinueButton.addEventListener("click", () => {
  deleteAllWarningDialog.close();
  deleteAllConfirmationInput.value = "";
  deleteAllConfirmButton.disabled = true;
  clearFormError(deleteAllError);
  deleteAllConfirmDialog.showModal();
  deleteAllConfirmationInput.focus();
});

deleteAllConfirmationInput.addEventListener("input", () => {
  deleteAllConfirmButton.disabled = deleteAllConfirmationInput.value !== "DELETE";
  clearFormError(deleteAllError);
});

deleteAllConfirmButton.addEventListener("click", () => {
  if (deleteAllConfirmationInput.value !== "DELETE") {
    showFormError(deleteAllError, new Error("DELETE と完全一致するように入力してください。"));
    return;
  }

  try {
    appData = resetAllAppData();
    pendingRestore = null;
    deleteAllConfirmDialog.close();
    resetUiAfterDataReplacement();
    showView("home");
    showToast("すべてのデータを削除し、初期状態に戻しました");
    window.setTimeout(openBalanceDialog, 0);
  } catch (error) {
    showDataOperationError(error, deleteAllError);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) showToast("別のタブでデータが更新されました。再読み込みしてください");
});

function formatYen(amount) {
  return `${new Intl.NumberFormat("ja-JP").format(amount)}円`;
}

function formatClassificationLabels(labels) {
  const categoryPath = labels.subcategoryName
    ? `${labels.categoryName} / ${labels.subcategoryName}`
    : labels.categoryName;
  return `${categoryPath}・${labels.paymentMethodName}`;
}

function getTransactionDisplayTitle(transaction, labels) {
  return transaction.title || labels.subcategoryName || labels.categoryName;
}

function formatSignedYen(amount) {
  if (amount === 0) return "0円";
  return `${amount > 0 ? "+" : "−"}${formatYen(Math.abs(amount))}`;
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "不明";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getLocalToday() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function cloneData(data) {
  return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}

document.querySelectorAll('input[type="date"]').forEach((input) => {
  input.value = getLocalToday();
});

const chartLibraryScript = document.querySelector("[data-chart-library]");
if (chartLibraryScript && typeof globalThis.Chart !== "function") {
  chartLibraryScript.addEventListener("load", () => {
    renderHome();
    renderStatistics();
  }, { once: true });
  chartLibraryScript.addEventListener("error", () => {
    renderHome();
    renderStatistics();
  }, { once: true });
}

initializeApp();
