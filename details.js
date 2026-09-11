"use strict";

const EXPLORER_VIEWS = new Set(["overview", "coverage", "timeline", "map", "programs", "organizations", "fields"]);

function initializeOrganizations(registry) {
  const bySourceName = new Map();
  state.organizations = registry.map(entry => {
    const organization = { ...entry, programs: [] };
    entry.source_names.forEach(name => bySourceName.set(cleanText(name), organization));
    return organization;
  });
  state.rows.forEach(row => {
    row.organizationIds = [];
    splitList(row.organization).forEach(name => {
      const organization = bySourceName.get(name);
      if (!organization) throw new Error(`Organization missing from identity registry: ${name}`);
      if (!row.organizationIds.includes(organization.id)) {
        row.organizationIds.push(organization.id);
        organization.programs.push(row);
      }
    });
  });
}

function recordUrl(kind, id) {
  return `#/${kind}/${encodeURIComponent(id)}`;
}

function programLink(row) {
  return `<a href="${escapeHtml(recordUrl("programs", row.program_id))}">${escapeHtml(row.title || "Untitled program")}</a>`;
}

function organizationLinks(row) {
  return row.organizationIds.map(id => {
    const organization = state.organizations.find(item => item.id === id);
    return `<a href="${escapeHtml(recordUrl("organizations", id))}">${escapeHtml(organization.name)}</a>`;
  }).join("; ") || "Organization not listed";
}

function bindDetailEvents() {
  document.querySelector(".skip-link").addEventListener("click", event => {
    event.preventDefault();
    const target = document.querySelector(event.currentTarget.getAttribute("href"));
    target.focus();
    target.scrollIntoView();
  });
  window.addEventListener("hashchange", () => {
    if (state.manifest) renderRoute();
  });
  document.getElementById("organizationSort").addEventListener("change", event => {
    state.organizationSort = event.target.value;
    state.organizationLimit = 24;
    renderOrganizations(getFilteredRows());
  });
  document.getElementById("loadMoreOrganizations").addEventListener("click", () => {
    state.organizationLimit += 24;
    renderOrganizations(getFilteredRows());
  });
  document.getElementById("recordPage").addEventListener("click", async event => {
    const button = event.target.closest("[data-copy-record-link]");
    if (!button) return;
    const url = new URL(window.location.href);
    url.search = "";
    const status = document.getElementById("copyLinkStatus");
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = "Link copied";
    } catch {
      status.textContent = `Page link: ${url.href}`;
    }
  });
}

function renderOrganizations(rows) {
  const matchingIds = new Set(rows.map(row => row.program_id));
  const organizations = state.organizations.map(organization => ({
    ...organization,
    matching: organization.programs.filter(row => matchingIds.has(row.program_id))
  })).filter(organization => organization.matching.length);
  organizations.sort((a, b) => (state.organizationSort === "count" ? b.matching.length - a.matching.length : 0) || a.name.localeCompare(b.name));
  document.getElementById("organizationResultSummary").textContent = `${formatNumber(organizations.length)} organizations`;
  document.getElementById("organizationList").innerHTML = organizations.slice(0, state.organizationLimit).map(organization => {
    const services = distinct(organization.matching.flatMap(row => row.servicesList)).sort();
    return `<article class="program-card organization-card">
      <div class="program-card__top">
        <h3><a href="${recordUrl("organizations", organization.id)}">${escapeHtml(organization.name)}</a></h3>
        <span class="program-card__date">${formatNumber(organization.matching.length)} matching / ${formatNumber(organization.programs.length)} total programs</span>
      </div>
      <div class="chips">${services.slice(0, 6).map(service => chip(service, "chip--teal")).join("")}</div>
      <ul class="organization-preview">${organization.matching.slice(0, 3).map(row => `<li>${programLink(row)}</li>`).join("")}</ul>
    </article>`;
  }).join("") || '<div class="empty-state">No organizations match the current filters.</div>';
  const more = document.getElementById("loadMoreOrganizations");
  more.classList.toggle("is-hidden", organizations.length <= state.organizationLimit);
  more.textContent = `Show ${formatNumber(Math.min(24, Math.max(0, organizations.length - state.organizationLimit)))} more`;
}

function renderRoute(moveFocus = true) {
  const page = document.getElementById("recordPage");
  const shell = document.querySelector(".app-shell");
  let parts;
  try {
    parts = window.location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  } catch {
    parts = ["invalid"];
  }
  const [kind, id] = parts;
  const isList = parts.length === 1 && (!kind || EXPLORER_VIEWS.has(kind));
  shell.hidden = !isList;
  page.hidden = isList;
  document.querySelector(".skip-link").href = isList ? "#explorer" : "#recordPage";
  if (isList) {
    state.view = kind || "overview";
    renderTabs();
    document.title = "Find It Cambridge Data Explorer";
    if (moveFocus) document.getElementById("explorer").focus({ preventScroll: true });
    return;
  }
  let title = "Record not found";
  let content = '<p>This record is not available in the current snapshot.</p>';
  let list = "programs";
  if (kind === "programs" && parts.length === 2) {
    const row = state.rows.find(item => item.program_id === id);
    if (row) {
      title = row.title || "Untitled program";
      content = renderFullProgram(row);
    }
  } else if (kind === "organizations" && parts.length === 2) {
    list = "organizations";
    const organization = state.organizations.find(item => item.id === id);
    if (organization) {
      title = organization.name;
      content = renderFullOrganization(organization);
    }
  }
  document.title = `${title} | Find It Cambridge Data Explorer`;
  page.innerHTML = `<div class="record-toolbar">
      <a href="#/${list}">Back to ${list}</a>
      <div class="record-share"><span id="copyLinkStatus" role="status"></span><button class="button button--secondary" type="button" data-copy-record-link>Copy page link</button></div>
    </div>
    <h1 class="record-title">${escapeHtml(title)}</h1>${content}`;
  window.scrollTo(0, 0);
  if (moveFocus) page.focus({ preventScroll: true });
}

function linkedField(label, html) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${html || "Not listed"}</dd></div>`;
}

function fullField(row, key) {
  const column = state.dictionary.columns.find(item => item.field_name === key);
  const label = column?.display_name || key.replaceAll("_", " ");
  const value = row[key];
  if (key === "organization") return linkedField(label, organizationLinks(row));
  if (key === "program_url" || key === "registration_web_url") {
    const url = safeUrl(value);
    return linkedField(label, url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(key === "program_url" ? "View on Find It Cambridge" : row.registration_link_text || url)}</a>` : escapeHtml(value));
  }
  if (LIST_FIELDS.includes(key)) return detail(label, friendlyList(row[`${key}List`]));
  if (["created_date", "updated_date"].includes(key)) return detail(label, formatDataDate(value));
  if (["program_timing", "virtual_option", "registration_type"].includes(key)) return detail(label, friendly(value));
  return detail(label, typeof value === "object" && value !== null ? JSON.stringify(value) : value);
}

function renderFullProgram(row) {
  const groups = [
    ["About", ["summary", "description", "organization", "program_url"]],
    ["Who it serves", ["services", "ages", "grades", "eligibility"]],
    ["When and where", ["locations", "program_timing", "days_of_week", "times_of_day", "schedule_notes", "virtual_option"]],
    ["Cost and registration", ["cost_description", "cost_subsidies", "registration_type", "registration_web_url", "registration_link_text", "registration_notes"]],
    ["Access and contact", ["transportation", "accessibility", "contacts", "contact_notes"]],
    ["Record and geocoding", ["program_id", "source_status", "created_date", "updated_date", "location_latitude", "location_longitude", "location_point", "geocode_status", "geocode_source", "geocode_query", "geocode_match_address", "geocode_match_segment", "geocode_match_count"]]
  ];
  const covered = new Set(groups.flatMap(([, fields]) => fields).concat("title"));
  const sourceRow = state.sourceRows.get(row.program_id);
  const extra = Object.keys(sourceRow).filter(key => !covered.has(key));
  if (extra.length) groups.push(["Additional source fields", extra]);
  return `<p class="record-meta">Program ${escapeHtml(row.program_id)} &middot; Updated ${escapeHtml(formatDataDate(row.updated_date) || "Not listed")}</p>
    ${groups.map(([heading, fields]) => `<section class="record-section"><h2>${heading}</h2><dl class="record-fields">${fields.map(key => fullField(row, key)).join("")}</dl></section>`).join("")}`;
}

function renderFullOrganization(organization) {
  const rows = [...organization.programs].sort((a, b) => a.title.localeCompare(b.title));
  const services = distinct(rows.flatMap(row => row.servicesList)).sort();
  const ages = distinct(rows.flatMap(row => row.agesList));
  const updated = rows.map(row => row.updatedAt).filter(Boolean).sort((a, b) => b - a)[0];
  const associatedValues = (keys) => {
    const values = new Map();
    rows.forEach(row => {
      const value = keys.map(key => row[key]).filter(Boolean).join(" - ");
      if (!value) return;
      if (!values.has(value)) values.set(value, []);
      values.get(value).push(row);
    });
    return values.size ? `<ul class="associated-values">${[...values].map(([value, programs]) => `<li><p>${escapeHtml(value)}</p><div class="associated-programs">${programs.map(programLink).join("; ")}</div></li>`).join("")}</ul>` : '<p class="record-meta">Not listed in the associated programs.</p>';
  };
  return `<p class="record-meta">${escapeHtml(organization.id)} &middot; ${formatNumber(rows.length)} programs in this snapshot</p>
    <p class="record-provenance">This profile is assembled from associated program records, not a separate organization profile. Locations and contacts below belong to those programs. All associated programs are shown, regardless of explorer filters.</p>
    <section class="record-section"><h2>Program coverage</h2><dl class="record-fields">
      ${detail("Organization", organization.name)}
      ${detail("Services across programs", services.join("; "))}
      ${detail("Ages across programs", orderEntries(Object.fromEntries(ages.map(age => [age, 1])), AGE_ORDER).map(([age]) => age).join("; "))}
      ${detail("Latest program update", updated ? formatShortDate(updated) : "")}
    </dl></section>
    <section class="record-section"><h2>Program locations</h2>${associatedValues(["locations"])}</section>
    <section class="record-section"><h2>Program contacts</h2>${associatedValues(["contacts", "contact_notes"])}</section>
    <section class="record-section"><h2>Programs (${formatNumber(rows.length)})</h2><div class="program-list">${rows.map(renderProgramCard).join("") || '<p>No programs in this snapshot.</p>'}</div></section>`;
}
