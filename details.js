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
  document.querySelector(".hero").hidden = !isList;
  page.hidden = isList;
  document.body.classList.toggle("is-record-page", !isList);
  document.querySelector(".skip-link").href = isList ? "#explorer" : "#recordPage";
  if (isList) {
    state.view = kind || "overview";
    renderTabs();
    document.title = "Find It Cambridge Data Explorer";
    if (moveFocus) document.getElementById("explorer").focus({ preventScroll: true });
    return;
  }
  let title = "Record not found";
  let content = '<h1 class="record-title">Record not found</h1><p>This record is not available.</p>';
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
  state.view = list;
  renderTabs();
  document.title = `${title} | Find It Cambridge Data Explorer`;
  page.innerHTML = `<div class="record-toolbar">
      <a href="#/${list}">Back to ${list}</a>
      <div class="record-share"><span id="copyLinkStatus" role="status"></span><button class="button button--secondary" type="button" data-copy-record-link>Copy page link</button></div>
    </div>
    ${content}`;
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
  const registrationUrl = safeUrl(row.registration_web_url);
  const sourceUrl = safeUrl(row.program_url);
  const registrationTitle = { application: "Application required", registration: "Registration required", optional: "Registration optional", none: "No registration required" }[row.registration_type] || "Registration";
  const signup = [
    profileText(friendlyList(row.agesList), "Ages"),
    profileText(friendlyList(row.gradesList), "Grades"),
    profileText(row.eligibility)
  ].join("") || '<p>Eligibility information is not listed.</p>';
  const registration = profileAction(registrationUrl, row.registration_link_text || "Sign up") + profileText(row.registration_notes)
    || '<p>Registration instructions are not listed.</p>';
  const cost = profileText(row.cost_description) + profileText(friendlyList(row.cost_subsidiesList));
  const location = profileText(friendly(row.virtual_option)) + profileText(row.locations)
    + profileText(row.neighborhoodName, "Neighborhood") + profileText(friendlyList(row.transportationList), "Transportation");
  const schedule = profileText(friendly(row.program_timing)) + profileText(friendlyList(row.days_of_weekList), "Days")
    + profileText(friendlyList(row.times_of_dayList), "Times") + profileText(row.schedule_notes);
  const related = state.rows.filter(candidate => candidate.program_id !== row.program_id
    && candidate.organizationIds.some(id => row.organizationIds.includes(id))).sort((a, b) => a.title.localeCompare(b.title));
  return `<div class="profile-layout">
    <div class="profile-main">
      <header class="profile-intro">
        <h1 class="record-title">${escapeHtml(row.title || "Untitled program")}</h1>
        <p class="profile-byline">By ${organizationLinks(row)}</p>
        ${profileText(row.summary, "", "profile-lead")}
      </header>
      ${profileSection("Sign-up information", signup, "profile-signup")}
      ${profileSection(registrationTitle, registration, "profile-registration")}
      ${profileSection("Cost", cost || '<p>Cost information is not listed.</p>')}
      ${profileSection("Location", location)}
      ${profileSection("Dates and times", schedule)}
      ${row.accessibility ? profileSection("Accessibility", profileText(friendlyList(row.accessibilityList))) : ""}
      ${profileSection("Additional information", profileText(row.description) || '<p>No additional description is listed.</p>')}
      ${renderRecordDisclosure(row)}
    </div>
    <aside class="profile-sidebar" aria-label="Program contact and services">
      <section class="profile-contact">
        ${row.cost_subsidiesList.includes("free") ? '<span class="profile-badge">Free</span>' : ""}
        <h2>Contact</h2>
        ${profileText(row.contacts || "Contact not listed", "", "profile-contact-name")}
        ${profileText(row.contact_notes)}
        <div class="profile-provider">${organizationLinks(row)}</div>
        ${profileAction(sourceUrl, "View on Find It Cambridge")}
      </section>
      ${profileSection("Services", `<div class="chips">${row.servicesList.map(service => chip(service, "chip--teal")).join("") || "Not listed"}</div>`)}
      <p class="record-meta">Last updated ${escapeHtml(formatDataDate(row.updated_date) || "date not listed")}.</p>
    </aside>
  </div>
  ${related.length ? `<section class="profile-related"><h2>Related programs</h2><p>More from the organizations that brought you this program.</p><div class="profile-program-grid">${related.slice(0, 4).map(renderProgramCard).join("")}</div><p class="profile-all-programs">All programs from ${organizationLinks(row)}</p></section>` : ""}`;
}

function profileText(value, label = "", className = "") {
  return value ? `<p class="profile-text ${className}">${label ? `<strong>${escapeHtml(label)}:</strong> ` : ""}${escapeHtml(value)}</p>` : "";
}

function profileAction(url, label) {
  return url ? `<a class="button profile-action" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : "";
}

function profileSection(title, content, className = "") {
  return `<section class="profile-section ${className}"><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function renderRecordDisclosure(row) {
  const keys = distinct(state.dictionary.columns.map(column => column.field_name).concat(Object.keys(state.sourceRows.get(row.program_id))));
  return `<details class="record-source"><summary>Full record and geocoding details</summary><dl class="record-fields">${keys.map(key => fullField(row, key)).join("")}</dl></details>`;
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
  return `<div class="profile-layout">
    <div class="profile-main">
      <header class="profile-intro"><h1 class="record-title">${escapeHtml(organization.name)}</h1>
        <p class="profile-byline">${formatNumber(rows.length)} ${rows.length === 1 ? "program" : "programs"}</p>
      </header>
      <p class="record-provenance">Organization information is drawn from its program records. Locations and contacts belong to those programs. All associated programs are shown, regardless of explorer filters.</p>
      ${profileSection("Program locations", associatedValues(["locations"]))}
      ${profileSection("Program contacts", associatedValues(["contacts", "contact_notes"]))}
    </div>
    <aside class="profile-sidebar" aria-label="Organization program coverage">
      <section class="profile-contact"><h2>Program coverage</h2>
        <p class="profile-count">${formatNumber(rows.length)} <span>${rows.length === 1 ? "program" : "programs"}</span></p>
        <dl class="profile-facts">${detail("Ages across programs", orderEntries(Object.fromEntries(ages.map(age => [age, 1])), AGE_ORDER).map(([age]) => age).join("; "))}</dl>
      </section>
      ${profileSection("Services across programs", `<div class="chips">${services.map(service => chip(service, "chip--teal")).join("") || "Not listed"}</div>`)}
      <p class="record-meta">Latest program update: ${escapeHtml(updated ? formatShortDate(updated) : "Not listed")}.</p>
      <p class="record-meta">Organization ID: ${escapeHtml(organization.id)}</p>
    </aside>
  </div>
  <section class="profile-related"><h2>Programs (${formatNumber(rows.length)})</h2><div class="profile-program-grid">${rows.map(renderProgramCard).join("") || '<p>No programs listed.</p>'}</div></section>`;
}
