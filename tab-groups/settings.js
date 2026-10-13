"use strict";

/* ---------- connection to Zen ---------- */

const PREF_BRANCH = "zen.sitegroups.";
const PREF_SECTIONS = "zen.sitegroups.sections";

const inZen = typeof Services !== "undefined";
const chromeWin = (() => {
  try {
    return window.browsingContext?.topChromeWindow ?? null;
  } catch {
    return null;
  }
})();
const api = chromeWin?.ZenSiteGroups ?? null;

// Opened outside Zen (e.g. as a plain file), the page runs on sample data so
// it can still be looked at.
// Same as the defaults in tab-groups.uc.js.
const DEFAULT_SECTIONS = [
  { kind: "site", name: "YouTube", sites: ["youtube.com"], color: null },
  { kind: "site", name: "Reddit", sites: ["reddit.com"], color: null },
  { kind: "site", name: "Wikipedia", sites: ["wikipedia.org"], color: null },
  { kind: "site", name: "X", sites: ["x.com", "twitter.com"], color: null },
];
const defaultSections = () => api?.defaultSections?.() ?? structuredClone(DEFAULT_SECTIONS);
const SAMPLE = new Map([[PREF_SECTIONS, JSON.stringify(DEFAULT_SECTIONS)]]);
const SAMPLE_COLORS = { "youtube.com": "#ff0033", "reddit.com": "#ff4500" };

const prefs = inZen
  ? {
      getString: (k, d) => Services.prefs.getStringPref(k, d),
      setString: (k, v) => Services.prefs.setStringPref(k, v),
      getBool: (k, d) => Services.prefs.getBoolPref(k, d),
      setBool: (k, v) => Services.prefs.setBoolPref(k, v),
      observe(fn) {
        const observer = { observe: (_s, _t, name) => fn(name) };
        Services.prefs.addObserver(PREF_BRANCH, observer);
        window.addEventListener("unload", () => Services.prefs.removeObserver(PREF_BRANCH, observer));
      },
    }
  : {
      getString: (k, d) => SAMPLE.get(k) ?? d,
      setString: (k, v) => SAMPLE.set(k, v),
      getBool: (k, d) => (SAMPLE.has(k) ? SAMPLE.get(k) : d),
      setBool: (k, v) => SAMPLE.set(k, v),
      observe() {},
    };

/* ---------- helpers ---------- */

const PALETTE = [
  "#ff5d5d", "#ff8a3d", "#ffc53d", "#5ad17a", "#2ec4b6", "#4da3ff",
  "#6f7dff", "#a86bff", "#ff6bcb", "#ff8fa3", "#94a3b8", "#c9a27e",
];

const IDEAS = [
  { name: "AI", color: "#a86bff", sites: ["chatgpt.com", "claude.ai", "gemini.google.com", "perplexity.ai"] },
  { name: "Social", color: "#4da3ff", sites: ["x.com", "instagram.com", "facebook.com", "tiktok.com"] },
  { name: "Watch", color: "#ff6bcb", sites: ["netflix.com", "twitch.tv", "disneyplus.com", "primevideo.com"] },
];

// Icons shipped with the mod (icons/<site>.png), so ideas always show them.
const BUNDLED_ICONS = new Set(IDEAS.flatMap(idea => idea.sites));

const GLOBE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#8a8896" stroke-width="1.2"><circle cx="8" cy="8" r="6.4"/><path d="M1.6 8h12.8M8 1.6c2 2 2 10.8 0 12.8M8 1.6c-2 2-2 10.8 0 12.8"/></svg>`
  );

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") {
      el.className = value;
    } else if (key === "style") {
      for (const [prop, v] of Object.entries(value)) {
        if (v != null) {
          el.style.setProperty(prop, v);
        }
      }
    } else if (key.startsWith("on")) {
      el.addEventListener(key.slice(2), value);
    } else if (value !== false && value != null) {
      el.setAttribute(key, value === true ? "" : value);
    }
  }
  el.append(...children.flat().filter(c => c != null && c !== false));
  return el;
}

// The first icon source that worked for each site, so re-renders don't
// re-fetch or flicker.
const iconSources = new Map();

function favicon(site) {
  if (iconSources.has(site)) {
    return h("img", { alt: "", src: iconSources.get(site) });
  }
  const sources = [
    ...(BUNDLED_ICONS.has(site) ? [`icons/${site}.png`] : []),
    ...(inZen ? [`page-icon:https://www.${site}/`, `page-icon:https://${site}/`] : []),
    `https://${site}/favicon.ico`,
    GLOBE,
  ];
  let i = 0;
  const img = h("img", { alt: "", src: sources[0] });
  img.addEventListener("load", () => iconSources.set(site, img.src), { once: true });
  img.addEventListener("error", () => {
    if (++i < sources.length) {
      img.src = sources[i];
    } else {
      iconSources.set(site, GLOBE);
    }
  });
  return img;
}

function normalizeSite(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "");
}

function defaultName(site) {
  if (!site) {
    return "";
  }
  if (api) {
    return api.defaultName(site);
  }
  const parts = site.split(".");
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return parts.length > 2 ? `${cap(parts.at(-2))} ${cap(parts[0])}` : cap(parts[0]);
}

const displayName = s => s.name.trim() || defaultName(s.sites[0]) || (s.kind === "collection" ? "Unnamed collection" : "New website");

/* ---------- state ---------- */

function load() {
  let raw;
  try {
    raw = JSON.parse(prefs.getString(PREF_SECTIONS, "[]"));
  } catch {
    raw = [];
  }
  return (Array.isArray(raw) ? raw : []).map(s => ({
    kind: s.kind === "collection" ? "collection" : "site",
    name: String(s.name ?? ""),
    sites: (Array.isArray(s.sites) ? s.sites : []).map(normalizeSite).filter(Boolean),
    color: /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : null,
  }));
}

let sections = load();
let lastSaved = JSON.stringify(sections);
const ideaNotes = new Map();

function save() {
  lastSaved = JSON.stringify(sections);
  prefs.setString(PREF_SECTIONS, lastSaved);
}

const coloredHeaders = () => prefs.getBool("zen.sitegroups.colored-headers", true);

// Colors picked from site icons, filled in as they arrive.
const iconColors = new Map();
function autoColor(section) {
  for (const site of section.sites) {
    if (!iconColors.has(site)) {
      iconColors.set(site, null);
      const job = api ? api.iconColor(site) : Promise.resolve(SAMPLE_COLORS[site] ?? null);
      job.then(color => {
        iconColors.set(site, color);
        if (color) {
          renderSoon();
        }
      });
    }
    const color = iconColors.get(site);
    if (color) {
      return color;
    }
  }
  return null;
}
const sectionColor = s => s.color || autoColor(s);

/* ---------- editing ---------- */

const confirmDialog = document.getElementById("confirm");
function ask(text, okLabel = "Move it") {
  document.getElementById("confirm-text").textContent = text;
  document.getElementById("confirm-ok").textContent = okLabel;
  confirmDialog.returnValue = "";
  confirmDialog.showModal();
  return new Promise(resolve => {
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "ok"), { once: true });
  });
}

// Makes `site` free to join `target`, moving it out of another section if
// the user agrees. A website can only be in one section.
async function claim(site, target) {
  if (!site || !site.includes(".") || /\s/.test(site)) {
    return false;
  }
  if (target.sites.includes(site)) {
    return false;
  }
  const owner = sections.find(s => s !== target && s.sites.includes(site));
  if (owner) {
    const ok = await ask(`${site} is already in “${displayName(owner)}”. Move it to “${displayName(target)}”?`);
    if (!ok) {
      return false;
    }
    owner.sites = owner.sites.filter(d => d !== site);
    if (owner.kind === "site" && !owner.sites.length) {
      sections = sections.filter(s => s !== owner);
    }
  }
  return true;
}

async function setWebsite(section, value) {
  const site = normalizeSite(value);
  if (site === section.sites[0]) {
    return;
  }
  // Extra addresses (x.com also covering twitter.com) are kept.
  const extra = section.sites.slice(1).filter(d => d !== site);
  if (!site) {
    section.sites = extra;
  } else if (await claim(site, section)) {
    section.sites = [site, ...extra];
  }
  save();
  render();
}

async function addToCollection(section, value) {
  let added = false;
  for (const site of String(value).split(/[\s,;]+/).map(normalizeSite).filter(Boolean)) {
    if (await claim(site, section)) {
      section.sites.push(site);
      added = true;
    }
  }
  if (added) {
    save();
  }
  render();
  return added;
}

function move(section, delta) {
  const i = sections.indexOf(section);
  const j = i + delta;
  if (j < 0 || j >= sections.length) {
    return;
  }
  [sections[i], sections[j]] = [sections[j], sections[i]];
  save();
  render();
}

function remove(section) {
  sections = sections.filter(s => s !== section);
  save();
  render();
}

let focusAfterRender = null;

function addWebsite() {
  const section = { kind: "site", name: "", sites: [], color: null };
  sections.push(section);
  focusAfterRender = { section, selector: ".site-input" };
  save();
  render();
}

function addCollection(idea) {
  const used = new Set(sections.map(s => s.color));
  const section = {
    kind: "collection",
    name: idea?.name ?? "New collection",
    sites: [],
    color: idea?.color ?? PALETTE.find(c => !used.has(c)) ?? PALETTE[0],
  };
  const skipped = [];
  for (const site of idea?.sites ?? []) {
    const owner = sections.find(s => s.sites.includes(site));
    if (owner) {
      skipped.push(`${site} (in ${displayName(owner)})`);
    } else {
      section.sites.push(site);
    }
  }
  sections.push(section);
  if (idea) {
    ideaNotes.set(idea.name, skipped.length ? `Added. Skipped ${skipped.join(", ")}.` : "Added to your sections.");
  } else {
    focusAfterRender = { section, selector: ".name", select: true };
  }
  save();
  render();
}

/* ---------- color picker ---------- */

// One popover, moved into the row whose color button was clicked, so it
// scrolls with that row. Color changes update the row in place instead of
// re-rendering the page.
const popover = document.getElementById("color-popover");
const hueSlider = document.getElementById("hue");
let popoverSection = null;

popover.querySelector(".palette").append(
  ...PALETTE.map(color => h("button", { type: "button", "data-color": color, style: { "--swatch": color }, title: color }))
);

function hexToHue(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) {
    return 0;
  }
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60);
}

// Fixed saturation/lightness keeps every custom color readable on the sidebar.
function hueToHex(hue) {
  const s = 0.75;
  const l = 0.62;
  const f = n => {
    const k = (n + hue / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const rowFor = section => [...document.querySelectorAll(".section")].find(li => li.section === section);

function colorButtonContent(section) {
  return [
    section.color
      ? h("span", { class: "swatch", style: { "--swatch": section.color } })
      : h("span", { class: "swatch auto-swatch" }),
    section.color ? "Custom" : "Auto",
  ];
}

function markSelected() {
  for (const b of popover.querySelectorAll("[data-color]")) {
    const value = b.dataset.color === "auto" ? null : b.dataset.color;
    b.classList.toggle("selected", value === (popoverSection?.color ?? null));
  }
}

function openPopover(section, button) {
  closePopover();
  popoverSection = section;
  button.parentElement.append(popover);
  popover.classList.remove("above");
  popover.hidden = false;
  if (popover.getBoundingClientRect().bottom > window.innerHeight - 8) {
    popover.classList.add("above");
  }
  hueSlider.value = hexToHue(section.color ?? autoColor(section) ?? "#6f7dff");
  markSelected();
}

function closePopover() {
  popover.hidden = true;
  popoverSection = null;
  document.body.append(popover);
}

let saveTimer = null;
function setColor(color) {
  const section = popoverSection;
  if (!section) {
    return;
  }
  section.color = color;
  const li = rowFor(section);
  if (li) {
    const shown = coloredHeaders() ? sectionColor(section) : null;
    li.style.setProperty("--section-color", shown ?? "var(--text)");
    li.querySelector(".color-button").replaceChildren(...colorButtonContent(section));
  }
  markSelected();
  renderPreview();
  // Saving re-lays out the sidebar, so don't do it on every slider tick.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 120);
}

popover.addEventListener("click", e => {
  const button = e.target.closest("[data-color]");
  if (button) {
    setColor(button.dataset.color === "auto" ? null : button.dataset.color);
    closePopover();
  }
});

let hueFrame = null;
hueSlider.addEventListener("input", () => {
  hueFrame ??= requestAnimationFrame(() => {
    hueFrame = null;
    setColor(hueToHex(Number(hueSlider.value)));
  });
});

document.addEventListener("mousedown", e => {
  if (!popover.hidden && !popover.contains(e.target) && !e.target.closest(".color-button")) {
    closePopover();
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closePopover();
  }
});

/* ---------- rendering ---------- */

let dragged = null;

function renderSection(section, index) {
  const color = coloredHeaders() ? sectionColor(section) : null;
  const isCollection = section.kind === "collection";

  const nameInput = h("input", {
    class: "name",
    value: section.name,
    placeholder: isCollection ? "Collection name" : defaultName(section.sites[0]) || "Name",
    "aria-label": "Section name",
    oninput: e => {
      section.name = e.target.value;
      save();
      renderPreview();
    },
  });

  const colorButton = h(
    "button",
    {
      type: "button",
      class: "color-button",
      title: "Header color",
      onclick: e => (popoverSection === section ? closePopover() : openPopover(section, e.currentTarget)),
    },
    ...colorButtonContent(section)
  );

  let sitesRow;
  if (isCollection) {
    const input = h("input", {
      class: "site-input",
      placeholder: section.sites.length ? "Add another website…" : "Add a website, e.g. claude.ai",
      "aria-label": "Add a website",
      // Fires on Enter as well as on leaving the box.
      onchange: async e => {
        const enter = document.activeElement === e.target;
        if (e.target.value.trim() && (await addToCollection(section, e.target.value)) && enter) {
          focusAfterRender = { section, selector: ".site-input" };
          render();
        }
      },
    });
    sitesRow = h(
      "div",
      { class: "sites" },
      section.sites.map(site =>
        h(
          "span",
          { class: "chip" },
          favicon(site),
          site,
          h("button", {
            type: "button",
            title: `Remove ${site}`,
            onclick: () => {
              section.sites = section.sites.filter(d => d !== site);
              save();
              render();
            },
          }, "×")
        )
      ),
      input
    );
  } else {
    sitesRow = h(
      "div",
      { class: "sites" },
      h("input", {
        class: "site-input single",
        value: section.sites[0] ?? "",
        placeholder: "Website, e.g. youtube.com",
        "aria-label": "Website",
        onchange: e => setWebsite(section, e.target.value),
        onkeydown: e => e.key === "Enter" && e.target.blur(),
      }),
      section.sites.length > 1 ? h("span", { class: "muted small" }, `also ${section.sites.slice(1).join(", ")}`) : null
    );
  }

  const li = h(
    "li",
    {
      class: "section",
      style: { "--section-color": color },
      ondragstart: e => {
        dragged = section;
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      },
      ondragend: () => {
        li.draggable = false;
        dragged = null;
        render();
      },
      ondragover: e => {
        if (!dragged || dragged === section) {
          return;
        }
        e.preventDefault();
        const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
        li.classList.toggle("drop-after", after);
        li.classList.toggle("drop-before", !after);
      },
      ondragleave: () => li.classList.remove("drop-before", "drop-after"),
      ondrop: e => {
        e.preventDefault();
        if (!dragged || dragged === section) {
          return;
        }
        const after = li.classList.contains("drop-after");
        sections = sections.filter(s => s !== dragged);
        sections.splice(sections.indexOf(section) + (after ? 1 : 0), 0, dragged);
        save();
      },
    },
    h("span", {
      class: "grip",
      title: "Drag to reorder",
      onmousedown: () => (li.draggable = true),
      onmouseup: () => (li.draggable = false),
    }, "⠿"),
    h("span", { class: "icons" }, (section.sites.length ? section.sites.slice(0, isCollection ? 3 : 1) : [""]).map(site => (site ? favicon(site) : h("img", { alt: "", src: GLOBE })))),
    h(
      "div",
      { class: "name-row" },
      nameInput,
      h(
        "span",
        { class: `pill${isCollection ? " collection" : ""}` },
        isCollection ? `Collection · ${section.sites.length} site${section.sites.length === 1 ? "" : "s"}` : "Website"
      )
    ),
    h(
      "div",
      { class: "actions" },
      colorButton,
      h("button", { type: "button", class: "icon-button", title: "Move up", disabled: index === 0, onclick: () => move(section, -1) }, "↑"),
      h("button", { type: "button", class: "icon-button", title: "Move down", disabled: index === sections.length - 1, onclick: () => move(section, 1) }, "↓"),
      h("button", { type: "button", class: "icon-button delete", title: "Remove section", onclick: () => remove(section) }, "✕")
    ),
    sitesRow
  );
  li.section = section;
  return li;
}

function renderList() {
  const list = document.getElementById("sections");
  list.replaceChildren(...sections.map(renderSection));
  document.getElementById("empty").hidden = sections.length > 0;
}

function renderIdeas() {
  const names = new Set(sections.map(s => displayName(s).toLowerCase()));
  document.getElementById("ideas").replaceChildren(
    ...IDEAS.map(idea => {
      const added = names.has(idea.name.toLowerCase());
      return h(
        "div",
        { class: "idea", style: { "--idea-color": idea.color } },
        h("div", { class: "idea-head" }, idea.name, h("span", { class: "line" })),
        h("div", { class: "idea-sites" }, idea.sites.map(site => h("span", {}, favicon(site), site))),
        ideaNotes.has(idea.name) ? h("p", { class: "muted small" }, ideaNotes.get(idea.name)) : null,
        h(
          "button",
          { type: "button", class: "button", disabled: added, onclick: () => addCollection(idea) },
          added ? "Added" : "+ Add collection"
        )
      );
    })
  );
}

function renderPreview() {
  const colored = coloredHeaders();
  const keepEmpty = prefs.getBool("zen.sitegroups.keep-empty-headers", false);
  const divider = prefs.getBool("zen.sitegroups.rest-divider", true);
  const arrowRight = prefs.getString("zen.sitegroups.chevron-position", "right") !== "left";
  const rows = [h("div", { class: "p-new" }, "+  New Tab")];
  let first = true;
  for (const section of sections) {
    if (!section.sites.length && !keepEmpty) {
      continue;
    }
    const color = colored ? sectionColor(section) : null;
    rows.push(
      h(
        "div",
        {
          class: `p-header${color ? " colored" : ""}${section.sites.length ? "" : " empty"}${arrowRight ? " arrow-right" : ""}`,
          style: { "--c": color },
          title: "Hover to see the collapse arrow",
        },
        h("span", { class: "chevron" }),
        h("span", { class: "label" }, displayName(section)),
        h("span", { class: "line" })
      )
    );
    for (const site of section.sites.slice(0, section.kind === "site" ? 1 : 3)) {
      const title = section.kind === "site" ? displayName(section) : defaultName(site);
      rows.push(h("div", { class: `p-tab${first ? " active" : ""}` }, favicon(site), h("span", {}, title)));
      first = false;
    }
  }
  if (rows.length > 1 && divider) {
    rows.push(h("div", { class: "p-rest" }));
  }
  rows.push(
    h("div", { class: "p-tab other" }, h("span", { class: "p-dot" }), h("span", {}, "Other tab")),
    h("div", { class: "p-tab other" }, h("span", { class: "p-dot" }), h("span", {}, "Another tab"))
  );
  document.getElementById("preview").replaceChildren(...rows);
}

function render() {
  closePopover();
  renderList();
  renderIdeas();
  renderPreview();
  if (focusAfterRender) {
    const li = [...document.querySelectorAll(".section")].find(el => el.section === focusAfterRender.section);
    const target = li?.querySelector(focusAfterRender.selector);
    target?.focus();
    if (focusAfterRender.select) {
      target?.select();
    }
    focusAfterRender = null;
  }
}

let frame = null;
function renderSoon() {
  frame ??= requestAnimationFrame(() => {
    frame = null;
    // Don't re-render under the user's cursor while they type.
    if (document.activeElement?.matches("input:not([type=checkbox])") || !popover.hidden) {
      renderPreview();
    } else {
      render();
    }
  });
}

/* ---------- wiring ---------- */

document.getElementById("add-site").addEventListener("click", addWebsite);
document.getElementById("reset").addEventListener("click", async () => {
  if (await ask("Replace your sections with the defaults (YouTube, Reddit, Wikipedia, X)?", "Reset")) {
    sections = defaultSections();
    save();
    render();
  }
});
document.getElementById("add-collection").addEventListener("click", () => addCollection(null));

for (const group of document.querySelectorAll(".segmented")) {
  const buttons = [...group.querySelectorAll("button")];
  const select = value => buttons.forEach(b => b.classList.toggle("selected", b.dataset.value === value));
  select(prefs.getString(group.dataset.pref, group.dataset.default));
  group.addEventListener("click", e => {
    const button = e.target.closest("button");
    if (button) {
      prefs.setString(group.dataset.pref, button.dataset.value);
      select(button.dataset.value);
      renderPreview();
    }
  });
}

for (const toggle of document.querySelectorAll("input.switch")) {
  toggle.checked = prefs.getBool(toggle.dataset.pref, toggle.dataset.default === "true");
  toggle.addEventListener("change", () => {
    prefs.setBool(toggle.dataset.pref, toggle.checked);
    render();
  });
}

// Changes made elsewhere (right-click menus in the sidebar).
prefs.observe(name => {
  if (name === PREF_SECTIONS && prefs.getString(PREF_SECTIONS, "[]") !== lastSaved) {
    sections = load();
    lastSaved = JSON.stringify(sections);
    renderSoon();
  }
});

render();
