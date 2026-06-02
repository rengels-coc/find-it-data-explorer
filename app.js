"use strict";

const DATA_PATHS = {
  programs: "data/programs.json",
  dictionary: "data/data_dictionary.json",
  manifest: "data/manifest.json",
  neighborhoods: "data/cambridge_neighborhoods.geojson"
};

const LIST_FIELDS = [
  "services",
  "ages",
  "grades",
  "cost_subsidies",
  "days_of_week",
  "times_of_day",
  "transportation",
  "accessibility"
];

const AGE_ORDER = [
  "Pre-natal",
  "Infant",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "Young Adult",
  "Adult"
];

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_ORDER = ["Morning", "Afternoon", "Evening", "(blank)"];
const TIMING_ORDER = ["ongoing", "school", "summer", "between", "(blank)"];
const VIRTUAL_ORDER = ["false", "online", "online_only", "(blank)"];
const COST_ORDER = ["free", "aid", "scale", "vouchers", "some", "(blank)"];
const REGISTRATION_ORDER = ["registration", "application", "optional", "none", "(blank)"];
const MAP_WIDTH = 900;
const MAP_HEIGHT = 620;
const MAP_PADDING = 28;

const FRIENDLY = new Map([
  ["false", "In person"],
  ["online", "Online option"],
  ["online_only", "Online only"],
  ["ongoing", "Ongoing"],
  ["school", "School year"],
  ["summer", "Summer"],
  ["between", "Between terms"],
  ["free", "Free"],
  ["aid", "Financial aid"],
  ["scale", "Sliding scale"],
  ["vouchers", "Vouchers"],
  ["some", "Some cost support"],
  ["registration", "Registration"],
  ["application", "Application"],
  ["optional", "Optional"],
  ["none", "No registration"],
  ["from", "Transport from program"],
  ["to", "Transport to program"],
  ["no", "No transportation"],
  ["(blank)", "Not listed"]
]);

const COLORS = ["#00777a", "#2b5f9e", "#c9533f", "#a66c00", "#347a45", "#6a5d9e"];

const state = {
  rows: [],
  dictionary: null,
  manifest: null,
  neighborhoods: null,
  mapBounds: null,
  search: "",
  service: "all",
  age: "all",
  timing: "all",
  day: "all",
  cost: "all",
  registration: "all",
  virtual: "all",
  accessibleOnly: false,
  registrationLinkOnly: false,
  sort: "updated_desc",
  view: "overview",
  timelineField: "updated_date",
  mapMode: "points",
  programLimit: 24
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();

  try {
    const [programs, dictionary, manifest, neighborhoods] = await Promise.all([
      fetchJson(DATA_PATHS.programs),
      fetchJson(DATA_PATHS.dictionary),
      fetchJson(DATA_PATHS.manifest),
      fetchJson(DATA_PATHS.neighborhoods)
    ]);

    state.rows = programs.map(normalizeRow);
    state.dictionary = dictionary;
    state.manifest = manifest;
    state.neighborhoods = neighborhoods;
    state.mapBounds = getGeoBounds(neighborhoods.features || []);
    assignNeighborhoods();

    populateFilters();
    render();
    setStatus("");
  } catch (error) {
    setStatus(
      "Could not load the static data files. Run this from a local web server or GitHub Pages so browser fetch can read data/*.json.",
      true
    );
    console.error(error);
  }
}

function cacheElements() {
  [
    "datasetLink",
    "snapshotDate",
    "loadStatus",
    "resetFilters",
    "searchInput",
    "serviceFilter",
    "ageFilter",
    "timingFilter",
    "dayFilter",
    "costFilter",
    "registrationFilter",
    "virtualFilter",
    "accessibleOnly",
    "registrationLinkOnly",
    "sortSelect",
    "activeFilters",
    "metricProgramCount",
    "metricOrganizationCount",
    "metricServiceCount",
    "metricLatestUpdate",
    "serviceChart",
    "serviceChartNote",
    "timingChart",
    "ageHeatmap",
    "accessModeChart",
    "dayTimeMatrix",
    "costRegistrationMatrix",
    "blankFieldChart",
    "teamQuestions",
    "timelineChart",
    "timelineList",
    "mapCanvas",
    "mapSummary",
    "resultSummary",
    "programList",
    "loadMorePrograms",
    "metadataPanel",
    "fieldTable"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value.trim().toLowerCase();
    resetProgramLimit();
    render();
  });

  bindSelect("serviceFilter", "service");
  bindSelect("ageFilter", "age");
  bindSelect("timingFilter", "timing");
  bindSelect("dayFilter", "day");
  bindSelect("costFilter", "cost");
  bindSelect("registrationFilter", "registration");
  bindSelect("virtualFilter", "virtual");
  bindSelect("sortSelect", "sort");

  els.accessibleOnly.addEventListener("change", () => {
    state.accessibleOnly = els.accessibleOnly.checked;
    resetProgramLimit();
    render();
  });

  els.registrationLinkOnly.addEventListener("change", () => {
    state.registrationLinkOnly = els.registrationLinkOnly.checked;
    resetProgramLimit();
    render();
  });

  els.resetFilters.addEventListener("click", () => {
    Object.assign(state, {
      search: "",
      service: "all",
      age: "all",
      timing: "all",
      day: "all",
      cost: "all",
      registration: "all",
      virtual: "all",
      accessibleOnly: false,
      registrationLinkOnly: false,
      sort: "updated_desc",
      timelineField: "updated_date",
      mapMode: "points",
      programLimit: 24
    });
    syncControls();
    render();
  });

  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.viewButton;
      renderTabs();
    });
  });

  document.querySelectorAll("[data-timeline-field]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timelineField = button.dataset.timelineField;
      renderTimeline(getFilteredRows());
      renderSegments();
    });
  });

  document.querySelectorAll("[data-map-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mapMode = button.dataset.mapMode;
      renderMap(getFilteredRows());
      renderSegments();
    });
  });

  els.loadMorePrograms.addEventListener("click", () => {
    state.programLimit += 24;
    renderPrograms(getFilteredRows());
  });
}

function bindSelect(elementId, stateKey) {
  els[elementId].addEventListener("change", () => {
    state[stateKey] = els[elementId].value;
    resetProgramLimit();
    render();
  });
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path}: ${response.status}`);
  }
  return response.json();
}

function normalizeRow(row) {
  const normalized = { ...row };

  [
    "program_id",
    "title",
    "program_url",
    "source_status",
    "created_date",
    "updated_date",
    "organization",
    "locations",
    "summary",
    "description",
    "eligibility",
    "cost_description",
    "registration_type",
    "registration_web_url",
    "registration_link_text",
    "registration_notes",
    "program_timing",
    "schedule_notes",
    "virtual_option",
    "geocode_status",
    "geocode_source",
    "geocode_query",
    "geocode_match_address",
    "contacts",
    "contact_notes"
  ].forEach((field) => {
    normalized[field] = cleanText(normalized[field]);
  });

  LIST_FIELDS.forEach((field) => {
    normalized[field] = cleanText(normalized[field]);
    normalized[`${field}List`] = splitList(normalized[field]);
  });

  const pointCoords = Array.isArray(normalized.location_point?.coordinates)
    ? normalized.location_point.coordinates
    : [];
  const pointLongitude = Number(pointCoords[0]);
  const pointLatitude = Number(pointCoords[1]);
  normalized.locationLatitude = Number(normalized.location_latitude) || pointLatitude || null;
  normalized.locationLongitude = Number(normalized.location_longitude) || pointLongitude || null;
  normalized.hasLocationPoint =
    Number.isFinite(normalized.locationLatitude) && Number.isFinite(normalized.locationLongitude);
  normalized.cambridgeNeighborhoodId = cleanText(normalized[":@computed_region_wfuz_phaj"]);

  normalized.searchText = [
    normalized.title,
    normalized.organization,
    normalized.locations,
    normalized.summary,
    normalized.description,
    normalized.services,
    normalized.ages,
    normalized.grades,
    normalized.program_timing,
    normalized.geocode_match_address,
    normalized.contacts
  ]
    .join(" ")
    .toLowerCase();

  normalized.updatedAt = parseDate(normalized.updated_date);
  return normalized;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function splitList(value) {
  const seen = new Set();
  const parts = cleanText(value)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseDate(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? `${cleaned}T00:00:00` : cleaned;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function populateFilters() {
  setSelectOptions(els.serviceFilter, "All services", countListValues(state.rows, "servicesList"));
  setSelectOptions(els.ageFilter, "All ages", countListValues(state.rows, "agesList"), AGE_ORDER);
  setSelectOptions(els.timingFilter, "All timing", countSingleValues(state.rows, "program_timing"), TIMING_ORDER);
  setSelectOptions(els.dayFilter, "All days", countListValues(state.rows, "days_of_weekList"), DAY_ORDER);
  setSelectOptions(els.costFilter, "All cost options", countListValues(state.rows, "cost_subsidiesList"), COST_ORDER);
  setSelectOptions(
    els.registrationFilter,
    "All registration types",
    countSingleValues(state.rows, "registration_type"),
    REGISTRATION_ORDER
  );
  setSelectOptions(els.virtualFilter, "All virtual modes", countSingleValues(state.rows, "virtual_option"), VIRTUAL_ORDER);
}

function setSelectOptions(select, allLabel, counts, preferredOrder = null) {
  const currentValue = select.value || "all";
  select.innerHTML = "";
  select.append(new Option(allLabel, "all"));

  const entries = Object.entries(counts);
  entries.sort((a, b) => {
    if (preferredOrder) {
      const aIndex = preferredOrder.indexOf(a[0]);
      const bIndex = preferredOrder.indexOf(b[0]);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
    }
    return b[1] - a[1] || friendly(a[0]).localeCompare(friendly(b[0]));
  });

  entries.forEach(([value, count]) => {
    select.append(new Option(`${friendly(value)} (${formatNumber(count)})`, value));
  });

  select.value = [...select.options].some((option) => option.value === currentValue) ? currentValue : "all";
}

function syncControls() {
  els.searchInput.value = state.search;
  els.serviceFilter.value = state.service;
  els.ageFilter.value = state.age;
  els.timingFilter.value = state.timing;
  els.dayFilter.value = state.day;
  els.costFilter.value = state.cost;
  els.registrationFilter.value = state.registration;
  els.virtualFilter.value = state.virtual;
  els.accessibleOnly.checked = state.accessibleOnly;
  els.registrationLinkOnly.checked = state.registrationLinkOnly;
  els.sortSelect.value = state.sort;
  renderSegments();
}

function render() {
  const filteredRows = getFilteredRows();
  renderHeader();
  renderMetrics(filteredRows);
  renderActiveFilters();
  renderOverview(filteredRows);
  renderCoverage(filteredRows);
  renderTimeline(filteredRows);
  renderMap(filteredRows);
  renderPrograms(filteredRows);
  renderFields();
  renderTabs();
  renderSegments();
}

function renderHeader() {
  if (!state.manifest) return;
  els.datasetLink.href = state.manifest.dataset_url || "https://data.cambridgema.gov/d/agus-pe2z";
  const snapshot = formatDateTime(state.manifest.snapshot_generated_at);
  els.snapshotDate.textContent = snapshot ? `Static snapshot: ${snapshot}` : "Static snapshot";
}

function getFilteredRows() {
  return sortRows(
    state.rows.filter((row) => {
      if (state.search && !row.searchText.includes(state.search)) return false;
      if (!matchesList(row.servicesList, state.service)) return false;
      if (!matchesList(row.agesList, state.age)) return false;
      if (!matchesSingle(row.program_timing, state.timing)) return false;
      if (!matchesList(row.days_of_weekList, state.day)) return false;
      if (!matchesList(row.cost_subsidiesList, state.cost)) return false;
      if (!matchesSingle(row.registration_type, state.registration)) return false;
      if (!matchesSingle(row.virtual_option, state.virtual)) return false;
      if (state.accessibleOnly && row.accessibilityList.length === 0) return false;
      if (state.registrationLinkOnly && !safeUrl(row.registration_web_url)) return false;
      return true;
    })
  );
}

function matchesList(values, selected) {
  if (selected === "all") return true;
  if (selected === "(blank)") return values.length === 0;
  return values.includes(selected);
}

function matchesSingle(value, selected) {
  if (selected === "all") return true;
  const normalized = value || "(blank)";
  return normalized === selected;
}

function sortRows(rows) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (state.sort === "title_asc") {
      return a.title.localeCompare(b.title) || a.organization.localeCompare(b.organization);
    }
    if (state.sort === "organization_asc") {
      return a.organization.localeCompare(b.organization) || a.title.localeCompare(b.title);
    }
    const aTime = a.updatedAt ? a.updatedAt.getTime() : 0;
    const bTime = b.updatedAt ? b.updatedAt.getTime() : 0;
    return bTime - aTime || a.title.localeCompare(b.title);
  });
  return sorted;
}

function renderMetrics(rows) {
  const organizations = distinct(rows.map((row) => row.organization).filter(Boolean));
  const services = distinct(flatten(rows.map((row) => row.servicesList)));
  const latestUpdate = rows.reduce((latest, row) => {
    if (!row.updatedAt) return latest;
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);

  els.metricProgramCount.textContent = formatNumber(rows.length);
  els.metricOrganizationCount.textContent = formatNumber(organizations.length);
  els.metricServiceCount.textContent = formatNumber(services.length);
  els.metricLatestUpdate.textContent = latestUpdate ? formatShortDate(latestUpdate) : "Not listed";
}

function renderActiveFilters() {
  const chips = [];
  if (state.search) chips.push(`Search: ${state.search}`);
  addChip(chips, "Service", state.service);
  addChip(chips, "Age", state.age);
  addChip(chips, "Timing", state.timing);
  addChip(chips, "Day", state.day);
  addChip(chips, "Cost", state.cost);
  addChip(chips, "Registration", state.registration);
  addChip(chips, "Virtual", state.virtual);
  if (state.accessibleOnly) chips.push("Accessibility notes");
  if (state.registrationLinkOnly) chips.push("Registration link");

  els.activeFilters.innerHTML = chips.length
    ? chips.map((chip) => `<span class="chip chip--teal">${escapeHtml(chip)}</span>`).join("")
    : '<span class="chip">No active filters</span>';
}

function addChip(chips, label, value) {
  if (value !== "all") chips.push(`${label}: ${friendly(value)}`);
}

function renderOverview(rows) {
  const serviceCounts = countListValues(rows, "servicesList");
  const serviceEntries = topEntries(serviceCounts, 12, true);
  els.serviceChartNote.textContent = `${formatNumber(Object.keys(serviceCounts).length)} shown in filter set`;
  renderBarChart(els.serviceChart, serviceEntries, {
    color: COLORS[0],
    filterKey: "service",
    emptyText: "No service values match the current filters."
  });

  renderBarChart(els.timingChart, orderEntries(countSingleValues(rows, "program_timing"), TIMING_ORDER), {
    color: COLORS[1],
    filterKey: "timing",
    emptyText: "No timing values match the current filters."
  });

  renderAgeHeatmap(rows);

  renderBarChart(els.accessModeChart, orderEntries(countSingleValues(rows, "virtual_option"), VIRTUAL_ORDER), {
    color: COLORS[2],
    filterKey: "virtual",
    emptyText: "No access mode values match the current filters."
  });
}

function renderCoverage(rows) {
  renderDayTimeMatrix(rows);
  renderCostRegistrationMatrix(rows);
  renderBlankFields(rows);
  renderTeamQuestions(rows);
}

function renderBarChart(container, entries, options = {}) {
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(options.emptyText || "No values to show.")}</div>`;
    return;
  }

  container.innerHTML = entries
    .map(([value, count], index) => {
      const width = Math.max((count / max) * 100, 2);
      const color = options.color || COLORS[index % COLORS.length];
      return `
        <button class="bar-row" type="button" data-filter-key="${escapeHtml(options.filterKey || "")}" data-filter-value="${escapeHtml(value)}">
          <span class="bar-row__label" title="${escapeHtml(friendly(value))}">${escapeHtml(friendly(value))}</span>
          <span class="bar-row__track" aria-hidden="true">
            <span class="bar-row__fill" style="width:${width.toFixed(2)}%; --bar-color:${color}"></span>
          </span>
          <span class="bar-row__count">${formatNumber(count)}</span>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll("[data-filter-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.filterKey;
      const value = button.dataset.filterValue;
      if (!key || !(key in state)) return;
      state[key] = value;
      syncControls();
      resetProgramLimit();
      render();
    });
  });
}

function renderAgeHeatmap(rows) {
  const counts = countListValues(rows, "agesList");
  const entries = orderEntries(counts, AGE_ORDER);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);

  els.ageHeatmap.innerHTML = entries
    .map(([age, count]) => {
      const heat = Math.max(0.08, (count / max) * 0.78);
      return `
        <button class="heat-cell" type="button" data-age="${escapeHtml(age)}" style="--heat:${heat.toFixed(3)}">
          <strong>${formatNumber(count)}</strong>
          <span>${escapeHtml(friendly(age))}</span>
        </button>
      `;
    })
    .join("");

  els.ageHeatmap.querySelectorAll("[data-age]").forEach((button) => {
    button.addEventListener("click", () => {
      state.age = button.dataset.age;
      syncControls();
      resetProgramLimit();
      render();
    });
  });
}

function renderDayTimeMatrix(rows) {
  const matrix = DAY_ORDER.map((day) => {
    return TIME_ORDER.map((time) => {
      return rows.filter((row) => {
        const hasDay = row.days_of_weekList.includes(day);
        const times = row.times_of_dayList.length ? row.times_of_dayList : ["(blank)"];
        return hasDay && times.includes(time);
      }).length;
    });
  });
  renderMatrix(els.dayTimeMatrix, DAY_ORDER, TIME_ORDER, matrix, { rowFilterKey: "day" });
}

function renderCostRegistrationMatrix(rows) {
  const costValues = COST_ORDER.filter((value) => countListValues(rows, "cost_subsidiesList")[value] || value !== "(blank)");
  const registrationValues = REGISTRATION_ORDER.filter(
    (value) => countSingleValues(rows, "registration_type")[value] || value !== "(blank)"
  );
  const matrix = costValues.map((cost) => {
    return registrationValues.map((registration) => {
      return rows.filter((row) => matchesList(row.cost_subsidiesList, cost) && matchesSingle(row.registration_type, registration)).length;
    });
  });
  renderMatrix(els.costRegistrationMatrix, costValues, registrationValues, matrix, {
    rowFilterKey: "cost",
    columnFilterKey: "registration"
  });
}

function renderMatrix(container, rows, columns, matrix, options = {}) {
  const max = Math.max(...matrix.flat(), 1);
  const header = columns.map((column) => `<th>${escapeHtml(friendly(column))}</th>`).join("");
  const body = rows
    .map((rowName, rowIndex) => {
      const cells = columns
        .map((columnName, columnIndex) => {
          const count = matrix[rowIndex][columnIndex];
          const heat = count === 0 ? 0.02 : Math.max(0.08, (count / max) * 0.7);
          const attrs = [
            `style="--heat:${heat.toFixed(3)}"`,
            options.columnFilterKey ? `data-column-filter-key="${escapeHtml(options.columnFilterKey)}"` : "",
            options.columnFilterKey ? `data-column-filter-value="${escapeHtml(columnName)}"` : ""
          ].join(" ");
          return `<td ${attrs}>${formatNumber(count)}</td>`;
        })
        .join("");
      return `
        <tr>
          <th data-row-filter-key="${escapeHtml(options.rowFilterKey || "")}" data-row-filter-value="${escapeHtml(rowName)}">${escapeHtml(friendly(rowName))}</th>
          ${cells}
        </tr>
      `;
    })
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr><th></th>${header}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  container.querySelectorAll("[data-row-filter-key]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const key = cell.dataset.rowFilterKey;
      if (!key) return;
      state[key] = cell.dataset.rowFilterValue;
      syncControls();
      resetProgramLimit();
      render();
    });
  });

  container.querySelectorAll("[data-column-filter-key]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const key = cell.dataset.columnFilterKey;
      if (!key) return;
      state[key] = cell.dataset.columnFilterValue;
      syncControls();
      resetProgramLimit();
      render();
    });
  });
}

function renderBlankFields(rows) {
  const fields = [
    ["services", "Services"],
    ["locations", "Locations"],
    ["times_of_day", "Times of day"],
    ["accessibility", "Accessibility"],
    ["transportation", "Transportation"],
    ["registration_web_url", "Registration URL"],
    ["grades", "Grades"]
  ];
  const entries = fields
    .map(([field, label]) => {
      const blankCount = rows.filter((row) => {
        if (LIST_FIELDS.includes(field)) return row[`${field}List`].length === 0;
        return !cleanText(row[field]);
      }).length;
      return [label, blankCount];
    })
    .sort((a, b) => b[1] - a[1]);

  renderBarChart(els.blankFieldChart, entries, {
    color: COLORS[3],
    emptyText: "No blank-field profile is available."
  });
}

function renderTeamQuestions(rows) {
  const total = rows.length || 1;
  const blankServices = rows.filter((row) => row.servicesList.length === 0).length;
  const blankAccessibility = rows.filter((row) => row.accessibilityList.length === 0).length;
  const noTimes = rows.filter((row) => row.times_of_dayList.length === 0).length;
  const online = rows.filter((row) => ["online", "online_only"].includes(row.virtual_option)).length;
  const noLocation = rows.filter((row) => !row.locations).length;
  const stale = rows.filter((row) => row.updatedAt && daysSince(row.updatedAt) > 365).length;

  const questions = [
    `${formatNumber(blankServices)} programs in this filter set have no current service tag. Is that expected, or a taxonomy migration gap?`,
    `${formatPercent(blankAccessibility / total)} of programs do not list accessibility accommodations. Which fields should be required before publication?`,
    `${formatNumber(noTimes)} programs do not list time of day. Does the team want schedule precision, or is broad timing enough?`,
    `${formatNumber(online)} programs include an online or online-only option. Should virtual availability be highlighted more prominently on Find It?`,
    `${formatNumber(noLocation)} programs have no location text. Which should be marked virtual, citywide, or location pending?`,
    `${formatNumber(stale)} programs were last updated more than a year before this snapshot. What refresh cadence should trigger outreach?`
  ];

  els.teamQuestions.innerHTML = questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("");
}

function renderTimeline(rows) {
  const field = state.timelineField;
  const entries = rows
    .map((row) => ({ row, date: parseDate(row[field]) }))
    .filter((entry) => entry.date)
    .sort((a, b) => a.date - b.date);

  if (!entries.length) {
    els.timelineChart.innerHTML = '<div class="empty-state">No dated records match the current filters.</div>';
    els.timelineList.innerHTML = '<div class="empty-state">No dated records to list.</div>';
    return;
  }

  const monthCounts = new Map();
  entries.forEach(({ date }) => {
    const key = monthKey(date);
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  });

  const months = [...monthCounts.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...months.map(([, count]) => count), 1);
  els.timelineChart.innerHTML = months
    .map(([key, count]) => {
      const height = Math.max((count / max) * 220, 3);
      return `
        <div class="timeline-bar" title="${escapeHtml(monthLabel(key))}: ${formatNumber(count)}">
          <span class="timeline-bar__fill" style="height:${height.toFixed(1)}px"></span>
          <span class="timeline-bar__label">${escapeHtml(shortMonthLabel(key))}</span>
        </div>
      `;
    })
    .join("");

  const recent = [...entries].sort((a, b) => b.date - a.date).slice(0, 10);
  els.timelineList.innerHTML = recent
    .map(({ row, date }) => {
      const url = safeUrl(row.program_url);
      const title = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(row.title || "Untitled program")}</a>`
        : escapeHtml(row.title || "Untitled program");
      return `
        <div class="summary-row">
          <strong>${title}</strong>
          <span>${escapeHtml(formatShortDate(date))}</span>
        </div>
      `;
    })
    .join("");
}

function renderMap(rows) {
  const features = state.neighborhoods?.features || [];
  if (!features.length || !state.mapBounds) {
    els.mapCanvas.innerHTML = '<div class="empty-state">Neighborhood geography is unavailable.</div>';
    els.mapSummary.innerHTML = "";
    return;
  }

  const locationRows = rows.filter((row) => row.hasLocationPoint);
  const counts = countNeighborhoods(locationRows);
  const maxCount = Math.max(...Object.values(counts), 1);
  const polygons = features.map((feature) => {
    const name = feature.properties?.name || "Neighborhood";
    const count = counts[name] || 0;
    const fill = state.mapMode === "neighborhoods" ? heatFill(count, maxCount) : "#dfe9e5";
    const className = state.mapMode === "neighborhoods" ? "map-neighborhood" : "map-neighborhood map-neighborhood--outline";
    return `
      <path class="${className}" d="${geometryToPath(feature.geometry)}" fill="${fill}">
        <title>${escapeHtml(name)}: ${formatNumber(count)} mapped programs</title>
      </path>
    `;
  });

  const labels = features.map((feature) => {
    const name = feature.properties?.name || "";
    const center = featureCenter(feature);
    return `<text class="map-label" x="${center.x.toFixed(1)}" y="${center.y.toFixed(1)}">${escapeHtml(shortNeighborhoodName(name))}</text>`;
  });

  const points =
    state.mapMode === "points"
      ? locationRows
          .map((row) => {
            const point = projectCoord([row.locationLongitude, row.locationLatitude]);
            return `
              <circle class="map-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4">
                <title>${escapeHtml(row.title || "Untitled program")} - ${escapeHtml(row.organization || "Organization not listed")}</title>
              </circle>
            `;
          })
          .join("")
      : "";

  els.mapCanvas.innerHTML = `
    <svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="Cambridge program location map">
      <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="#eef4f2"></rect>
      <g>${polygons.join("")}</g>
      <g>${points}</g>
      <g>${labels.join("")}</g>
    </svg>
    ${renderMapLegend(locationRows.length, maxCount)}
  `;

  renderMapSummary(rows, locationRows, counts);
}

function renderMapLegend(mappedCount, maxCount) {
  if (state.mapMode === "points") {
    return `
      <div class="map-legend">
        <span class="legend-swatch" style="--swatch: var(--coral)"></span>
        <span>${formatNumber(mappedCount)} mapped programs</span>
      </div>
    `;
  }

  return `
    <div class="map-legend">
      <span>Fewer</span>
      <span class="legend-swatch" style="--swatch: ${heatFill(1, maxCount)}"></span>
      <span class="legend-swatch" style="--swatch: ${heatFill(Math.max(1, Math.floor(maxCount / 2)), maxCount)}"></span>
      <span class="legend-swatch" style="--swatch: ${heatFill(maxCount, maxCount)}"></span>
      <span>More</span>
    </div>
  `;
}

function renderMapSummary(rows, locationRows, counts) {
  const unmapped = rows.length - locationRows.length;
  const withoutNeighborhood = locationRows.filter((row) => !row.neighborhoodName).length;
  const topNeighborhoods = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);

  const rowsHtml = [
    ["Filtered programs", formatNumber(rows.length)],
    ["Mapped points", formatNumber(locationRows.length)],
    ["No point", formatNumber(unmapped)],
    ["No neighborhood match", formatNumber(withoutNeighborhood)]
  ]
    .map(([label, value]) => summaryRow(label, value))
    .join("");

  const neighborhoodsHtml = topNeighborhoods.length
    ? topNeighborhoods.map(([name, count]) => summaryRow(name, formatNumber(count))).join("")
    : '<div class="empty-state">No neighborhood counts match the current filters.</div>';

  els.mapSummary.innerHTML = `${rowsHtml}<h3>Top neighborhoods</h3>${neighborhoodsHtml}`;
}

function assignNeighborhoods() {
  const features = state.neighborhoods?.features || [];
  state.rows.forEach((row) => {
    if (!row.hasLocationPoint) {
      row.neighborhoodName = "";
      return;
    }

    const feature = features.find((candidate) =>
      pointInGeometry([row.locationLongitude, row.locationLatitude], candidate.geometry)
    );
    row.neighborhoodName = feature?.properties?.name || "";
  });
}

function countNeighborhoods(rows) {
  const counts = {};
  rows.forEach((row) => {
    if (!row.neighborhoodName) return;
    counts[row.neighborhoodName] = (counts[row.neighborhoodName] || 0) + 1;
  });
  return counts;
}

function summaryRow(label, value) {
  return `
    <div class="summary-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

function renderPrograms(rows) {
  els.resultSummary.textContent = `${formatNumber(rows.length)} program${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    els.programList.innerHTML = '<div class="empty-state">No programs match the current filters.</div>';
    els.loadMorePrograms.classList.add("is-hidden");
    return;
  }

  const visibleRows = rows.slice(0, state.programLimit);
  els.programList.innerHTML = visibleRows.map(renderProgramCard).join("");
  els.loadMorePrograms.classList.toggle("is-hidden", rows.length <= state.programLimit);
  els.loadMorePrograms.textContent = `Show ${formatNumber(Math.min(24, rows.length - state.programLimit))} more`;
}

function renderProgramCard(row) {
  const programUrl = safeUrl(row.program_url);
  const registrationUrl = safeUrl(row.registration_web_url);
  const services = row.servicesList.slice(0, 4).map((value) => chip(value, "chip--teal")).join("");
  const ages = row.agesList.slice(0, 5).map((value) => chip(value, "chip--blue")).join("");
  const modes = [row.program_timing, row.virtual_option, row.registration_type]
    .filter(Boolean)
    .map((value) => chip(friendly(value), "chip--coral"))
    .join("");
  const title = programUrl
    ? `<a href="${escapeHtml(programUrl)}" target="_blank" rel="noopener">${escapeHtml(row.title || "Untitled program")}</a>`
    : escapeHtml(row.title || "Untitled program");

  return `
    <article class="program-card">
      <div class="program-card__top">
        <div>
          <h3>${title}</h3>
          <p class="program-card__org">${escapeHtml(row.organization || "Organization not listed")}</p>
        </div>
        <span class="program-card__date">${escapeHtml(formatDataDate(row.updated_date) || "No update date")}</span>
      </div>
      <p class="program-card__summary">${escapeHtml(truncate(row.summary || row.description || "No summary listed.", 260))}</p>
      <div class="chips">${services}${ages}${modes}</div>
      <details>
        <summary>Details</summary>
        <dl class="detail-grid">
          ${detail("Location", row.locations)}
          ${detail("Schedule", scheduleText(row))}
          ${detail("Cost", row.cost_description || friendlyList(row.cost_subsidiesList))}
          ${detail("Registration", registrationText(row, registrationUrl))}
          ${detail("Accessibility", friendlyList(row.accessibilityList))}
          ${detail("Contact", [row.contacts, row.contact_notes].filter(Boolean).join(" - "))}
        </dl>
      </details>
    </article>
  `;
}

function chip(value, className = "") {
  if (!value) return "";
  return `<span class="chip ${className}">${escapeHtml(value)}</span>`;
}

function detail(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${value ? escapeHtml(value) : "Not listed"}</dd>
    </div>
  `;
}

function registrationText(row, registrationUrl) {
  const parts = [friendly(row.registration_type || "(blank)")];
  if (registrationUrl) parts.push(registrationUrl);
  if (row.registration_notes) parts.push(row.registration_notes);
  return parts.join(" - ");
}

function scheduleText(row) {
  return [
    friendly(row.program_timing || "(blank)"),
    friendlyList(row.days_of_weekList),
    friendlyList(row.times_of_dayList),
    row.schedule_notes
  ]
    .filter(Boolean)
    .join(" - ");
}

function renderFields() {
  if (!state.dictionary) return;
  const columns = state.dictionary.columns || [];
  els.metadataPanel.innerHTML = [
    ["Dataset", state.dictionary.dataset_name || state.socrata?.name || "Find It Cambridge"],
    ["Rows", formatNumber(state.manifest?.record_count || state.rows.length)],
    ["Prepared", state.dictionary.prepared_date || ""],
    ["Source export", state.dictionary.source_export_date || ""]
  ]
    .map(
      ([label, value]) => `
        <div class="metadata-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value || "Not listed"))}</strong>
        </div>
      `
    )
    .join("");

  els.fieldTable.innerHTML = columns
    .map(
      (column) => `
        <tr>
          <td>${escapeHtml(column.field_name)}</td>
          <td>${escapeHtml(column.display_name)}</td>
          <td>${escapeHtml(column.socrata_type)}</td>
          <td>${escapeHtml(column.description)}</td>
        </tr>
      `
    )
    .join("");
}

function renderTabs() {
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewButton === state.view);
  });
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("is-active", view.id === state.view);
  });
}

function renderSegments() {
  document.querySelectorAll("[data-timeline-field]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timelineField === state.timelineField);
  });
  document.querySelectorAll("[data-map-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mapMode === state.mapMode);
  });
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function shortMonthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

function getGeoBounds(features) {
  const coords = features.flatMap((feature) => geometryCoordinates(feature.geometry));
  if (!coords.length) return null;
  return coords.reduce(
    (bounds, [lon, lat]) => ({
      minLon: Math.min(bounds.minLon, lon),
      maxLon: Math.max(bounds.maxLon, lon),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat)
    }),
    { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
  );
}

function geometryCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2);
  }
  return [];
}

function geometryToPath(geometry) {
  if (!geometry) return "";
  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map(polygonToPath).join(" ");
  }
  return "";
}

function polygonToPath(rings) {
  return rings
    .map((ring) => {
      const commands = ring
        .map((coord, index) => {
          const point = projectCoord(coord);
          return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        })
        .join(" ");
      return `${commands} Z`;
    })
    .join(" ");
}

function projectCoord([lon, lat]) {
  const bounds = state.mapBounds;
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.000001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.000001);
  const x = MAP_PADDING + ((lon - bounds.minLon) / lonSpan) * (MAP_WIDTH - MAP_PADDING * 2);
  const y = MAP_HEIGHT - MAP_PADDING - ((lat - bounds.minLat) / latSpan) * (MAP_HEIGHT - MAP_PADDING * 2);
  return { x, y };
}

function featureCenter(feature) {
  const coords = geometryCoordinates(feature.geometry);
  if (!coords.length) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const center = coords.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lon: 0, lat: 0 }
  );
  return projectCoord([center.lon / coords.length, center.lat / coords.length]);
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function pointInPolygon(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 0.000001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function heatFill(count, maxCount) {
  if (!count) return "#dfe9e5";
  const ratio = Math.max(0.12, Math.min(1, count / Math.max(maxCount, 1)));
  const start = [223, 238, 234];
  const end = [0, 119, 122];
  const color = start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function shortNeighborhoodName(name) {
  return name === "Neighborhood Nine" ? "Neighborhood 9" : name;
}

function countListValues(rows, listField) {
  const counts = {};
  rows.forEach((row) => {
    const values = row[listField] || [];
    if (!values.length) {
      counts["(blank)"] = (counts["(blank)"] || 0) + 1;
      return;
    }
    values.forEach((value) => {
      counts[value] = (counts[value] || 0) + 1;
    });
  });
  return counts;
}

function countSingleValues(rows, field) {
  const counts = {};
  rows.forEach((row) => {
    const value = row[field] || "(blank)";
    counts[value] = (counts[value] || 0) + 1;
  });
  return counts;
}

function topEntries(counts, limit, dropBlank = false) {
  return Object.entries(counts)
    .filter(([value]) => !dropBlank || value !== "(blank)")
    .sort((a, b) => b[1] - a[1] || friendly(a[0]).localeCompare(friendly(b[0])))
    .slice(0, limit);
}

function orderEntries(counts, preferredOrder) {
  const entries = Object.entries(counts);
  entries.sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a[0]);
    const bIndex = preferredOrder.indexOf(b[0]);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return b[1] - a[1] || friendly(a[0]).localeCompare(friendly(b[0]));
  });
  return entries;
}

function friendly(value) {
  if (!value) return "Not listed";
  return FRIENDLY.get(value) || value;
}

function friendlyList(values) {
  return values.length ? values.map(friendly).join("; ") : "";
}

function distinct(values) {
  return [...new Set(values)];
}

function flatten(values) {
  return values.reduce((acc, value) => acc.concat(value), []);
}

function resetProgramLimit() {
  state.programLimit = 24;
}

function safeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function daysSince(date) {
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value || 0);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDataDate(value) {
  const parsed = parseDate(value);
  return parsed ? formatShortDate(parsed) : cleanText(value);
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message, isError = false) {
  els.loadStatus.textContent = message;
  els.loadStatus.classList.toggle("is-hidden", !message);
  els.loadStatus.classList.toggle("is-error", isError);
}
