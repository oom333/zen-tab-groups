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
  { kind: "site", name: "YouTube", sites: ["youtube.com"], color: null, spaces: [] },
  { kind: "site", name: "Reddit", sites: ["reddit.com"], color: null, spaces: [] },
  { kind: "site", name: "Wikipedia", sites: ["wikipedia.org"], color: null, spaces: [] },
  { kind: "site", name: "X", sites: ["x.com", "twitter.com"], color: null, spaces: [] },
];
const defaultSections = () => api?.defaultSections?.() ?? structuredClone(DEFAULT_SECTIONS);
const SAMPLE = new Map([[PREF_SECTIONS, JSON.stringify(DEFAULT_SECTIONS)]]);
const SAMPLE_COLORS = { "youtube.com": "#ff0033", "reddit.com": "#ff4500" };
const SAMPLE_SPACES = [
  { id: "{00000000-0000-4000-8000-000000000001}", name: "Personal", icon: "🏠" },
  { id: "{00000000-0000-4000-8000-000000000002}", name: "Work", icon: "💼" },
];
const SPACE_ID = /^\{[0-9a-f-]{36}\}$/i;

// Zen's spaces, for sections used in only some of them.
const spaces = api ? (api.getSpaces?.() ?? []) : inZen ? [] : SAMPLE_SPACES;

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

// US banks, card issuers, online banks and credit unions. Best known first:
// idea cards only list the first few until expanded.
const BANKS = [
  // National banks (TD Bank's site moved to td.com)
  "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com", "usbank.com",
  "pnc.com", "truist.com", "td.com", "tdbank.com", "citizensbank.com", "53.com", "key.com",
  "huntington.com", "regions.com", "mtb.com", "bmo.com", "santanderbank.com", "firstcitizens.com",
  "usaa.com", "navyfederal.org",
  // Credit cards (Bread Financial store cards are managed on comenity.net)
  "americanexpress.com", "discover.com", "synchrony.com", "barclaysus.com", "barclaycardus.com",
  "breadfinancial.com", "comenity.net", "card.apple.com",
  // Online banks and money apps (LendingClub is moving to happen.com)
  "sofi.com", "ally.com", "marcus.com", "chime.com", "venmo.com", "varomoney.com", "current.com",
  "axosbank.com", "cit.com", "lendingclub.com", "happen.com", "upgrade.com", "dave.com",
  "moneylion.com", "mercury.com", "bluevine.com", "liveoak.bank", "ufbdirect.com", "baskbank.com",
  // Regional banks (Comerica is now part of Fifth Third, 53.com)
  "comerica.com", "zionsbank.com", "firsthorizon.com", "eastwestbank.com", "cnb.com", "frostbank.com",
  "ozk.com", "synovus.com", "websterbank.com", "valley.com", "cadencebank.com", "associatedbank.com",
  "flagstar.com", "umb.com", "wintrust.com", "popular.com", "oldnational.com", "pnfp.com",
  "prosperitybank.com", "columbiabank.com", "umpquabank.com", "hancockwhitney.com",
  "bankofoklahoma.com", "commercebank.com", "fnb-online.com", "simmonsbank.com", "arvest.com",
  "firstinterstatebank.com", "fultonbank.com", "atlanticunionbank.com", "trustmark.com",
  "bankunited.com", "amerisbank.com", "ucbi.com", "boh.com", "fhb.com",
  // Credit unions
  "penfed.org", "becu.org", "alliantcreditunion.org", "schoolsfirstfcu.org", "golden1.com",
  "ncsecu.org", "firsttechfed.com", "dcu.org", "rbfcu.org", "americafirst.com",
  "suncoastcreditunion.com", "mountainamerica.com", "bethpagefcu.com", "vystarcu.org", "psecu.com",
  "lmcu.org",
];

const IDEAS = [
  { name: "AI", color: "#a86bff", sites: ["chatgpt.com", "claude.ai", "gemini.google.com", "perplexity.ai"] },
  { name: "Social", color: "#4da3ff", sites: ["x.com", "instagram.com", "facebook.com", "tiktok.com"] },
  { name: "Watch", color: "#ff6bcb", sites: ["netflix.com", "twitch.tv", "disneyplus.com", "primevideo.com"] },
  { name: "Banking", color: "#5ad17a", sites: BANKS },
];

// Idea cards list this many sites until expanded.
const IDEA_PREVIEW = 6;
// Collections with more sites than this show only the first few chips.
const FOLDED_CHIPS = 10;

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

// Cleans up a saved list of sections (from the pref or a backup file).
function parseSections(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(s => s && typeof s === "object")
    .map(s => ({
      kind: s.kind === "collection" ? "collection" : "site",
      name: String(s.name ?? ""),
      sites: (Array.isArray(s.sites) ? s.sites : []).map(normalizeSite).filter(Boolean),
      color: /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : null,
      spaces: [...new Set((Array.isArray(s.spaces) ? s.spaces : []).filter(id => SPACE_ID.test(id)))],
    }));
}

function load() {
  let raw;
  try {
    raw = JSON.parse(prefs.getString(PREF_SECTIONS, "[]"));
  } catch {
    raw = [];
  }
  return parseSections(raw);
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
  const section = { kind: "site", name: "", sites: [], color: null, spaces: [] };
  sections.push(section);
  focusAfterRender = { section, selector: ".site-input" };
  save();
  render();
}

function addCollection() {
  const used = new Set(sections.map(s => s.color));
  const section = {
    kind: "collection",
    name: "New collection",
    sites: [],
    color: PALETTE.find(c => !used.has(c)) ?? PALETTE[0],
    spaces: [],
  };
  sections.push(section);
  focusAfterRender = { section, selector: ".name", select: true };
  save();
  render();
}

// The section an idea was added as, or one you made with the same name.
const ideaSection = idea => sections.find(s => displayName(s).toLowerCase() === idea.name.toLowerCase());
// An idea's sites that no section has yet.
const freeSites = idea => idea.sites.filter(site => !sections.some(s => s.sites.includes(site)));

// Adds an idea as a new collection, or adds its missing sites to the
// collection that already has its name.
function addIdea(idea) {
  const existing = ideaSection(idea);
  const section = existing ?? { kind: "collection", name: idea.name, sites: [], color: idea.color, spaces: [] };
  const skipped = [];
  let added = 0;
  for (const site of idea.sites) {
    const owner = sections.find(s => s.sites.includes(site));
    if (!owner) {
      section.sites.push(site);
      added++;
    } else if (owner !== section) {
      skipped.push(`${site} (in ${displayName(owner)})`);
    }
  }
  if (!existing) {
    sections.push(section);
  }
  expandedSections.delete(section);
  const note = existing
    ? `Added ${added} site${added === 1 ? "" : "s"} to “${displayName(section)}”.`
    : skipped.length
      ? "Added."
      : "Added to your sections.";
  const skippedNote = skipped.length > 3 ? `${skipped.length} sites already in other sections` : skipped.join(", ");
  ideaNotes.set(idea.name, skipped.length ? `${note} Skipped ${skippedNote}.` : note);
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
  closeSpacesPopover();
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

/* ---------- spaces ---------- */

// A popover like the color picker's, for the spaces a section is used in.
const spacesPopover = document.getElementById("spaces-popover");
let spacesSection = null;

// The spaces a section shows in: those on its list that exist, or all of
// them if none do (as in tab-groups.uc.js).
function sectionSpaces(section) {
  const listed = section.spaces.filter(id => spaces.some(s => s.id === id));
  return listed.length ? listed : spaces.map(s => s.id);
}

// Space icons are emoji, or an image from Zen's icon set; spaces can have none.
const spaceIcon = space =>
  !space.icon
    ? null
    : /^(chrome|resource|data):/.test(space.icon)
      ? h("img", { class: "space-icon", alt: "", src: space.icon })
      : h("span", { class: "space-icon" }, space.icon);

function spacesButtonContent(section) {
  const shown = spaces.filter(s => section.spaces.includes(s.id));
  if (!shown.length) {
    return ["All spaces"];
  }
  return shown.length === 1 ? [spaceIcon(shown[0]), shown[0].name].filter(Boolean) : [`${shown.length} spaces`];
}

function renderSpacesPopover() {
  const section = spacesSection;
  const selected = new Set(sectionSpaces(section));
  const everywhere = selected.size === spaces.length;
  spacesPopover.replaceChildren(
    h(
      "button",
      { type: "button", class: `auto-option${everywhere ? " selected" : ""}`, onclick: () => setSpaces(section, []) },
      "All spaces"
    ),
    ...spaces.map(space =>
      h(
        "label",
        { class: "space-option" },
        h("input", {
          type: "checkbox",
          checked: selected.has(space.id),
          onchange: e => toggleSpace(section, space.id, e.target.checked),
        }),
        spaceIcon(space),
        h("span", {}, space.name)
      )
    )
  );
}

function setSpaces(section, list) {
  section.spaces = list;
  save();
  rowFor(section)?.querySelector(".spaces-button")?.replaceChildren(...spacesButtonContent(section));
  renderSpacesPopover();
}

function toggleSpace(section, id, on) {
  const chosen = new Set(sectionSpaces(section));
  on ? chosen.add(id) : chosen.delete(id);
  if (!chosen.size) {
    renderSpacesPopover(); // a section needs at least one space
    return;
  }
  setSpaces(section, chosen.size === spaces.length ? [] : spaces.map(s => s.id).filter(s => chosen.has(s)));
}

function openSpacesPopover(section, button) {
  closePopover();
  spacesSection = section;
  button.parentElement.append(spacesPopover);
  renderSpacesPopover();
  spacesPopover.classList.remove("above");
  spacesPopover.hidden = false;
  if (spacesPopover.getBoundingClientRect().bottom > window.innerHeight - 8) {
    spacesPopover.classList.add("above");
  }
}

function closeSpacesPopover() {
  spacesPopover.hidden = true;
  spacesSection = null;
  document.body.append(spacesPopover);
}

document.addEventListener("mousedown", e => {
  if (!popover.hidden && !popover.contains(e.target) && !e.target.closest(".color-button")) {
    closePopover();
  }
  if (!spacesPopover.hidden && !spacesPopover.contains(e.target) && !e.target.closest(".spaces-button")) {
    closeSpacesPopover();
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closePopover();
    closeSpacesPopover();
  }
});

/* ---------- rendering ---------- */

let dragged = null;
// Collections and ideas whose full site list is shown.
const expandedSections = new WeakSet();
const expandedIdeas = new Set();

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

  // Only with several spaces, or for a section already limited to some.
  const spacesButton =
    spaces.length > 1 || section.spaces.length
      ? h(
          "button",
          {
            type: "button",
            class: "spaces-button",
            title: "Spaces this section is used in",
            onclick: e => (spacesSection === section ? closeSpacesPopover() : openSpacesPopover(section, e.currentTarget)),
          },
          ...spacesButtonContent(section)
        )
      : null;

  let sitesRow;
  if (isCollection) {
    const input = h("input", {
      class: "site-input",
      placeholder: section.sites.length ? "Add another website…" : "Add a website, e.g. claude.ai",
      "aria-label": "Add a website",
      // Fires on Enter as well as on leaving the box.
      onchange: async e => {
        const enter = document.activeElement === e.target;
        if (!e.target.value.trim()) {
          return;
        }
        // Unfold, so the new site doesn't vanish behind "+N more".
        expandedSections.add(section);
        if ((await addToCollection(section, e.target.value)) && enter) {
          focusAfterRender = { section, selector: ".site-input" };
          render();
        }
      },
    });
    // Big collections (like Banking) show a few chips until unfolded, but
    // never fold away just one or two.
    const foldable = section.sites.length > FOLDED_CHIPS + 2;
    const folded = foldable && !expandedSections.has(section);
    sitesRow = h(
      "div",
      { class: "sites" },
      (folded ? section.sites.slice(0, FOLDED_CHIPS) : section.sites).map(site =>
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
      foldable
        ? h(
            "button",
            {
              type: "button",
              class: "chip more",
              onclick: () => {
                folded ? expandedSections.add(section) : expandedSections.delete(section);
                render();
              },
            },
            folded ? `+${section.sites.length - FOLDED_CHIPS} more` : "Show fewer"
          )
        : null,
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
      spacesButton,
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
  document.getElementById("ideas").replaceChildren(
    ...IDEAS.map(idea => {
      // Already there: offer to fill in what's missing, if it's a collection.
      const existing = ideaSection(idea);
      const missing = existing?.kind === "collection" ? freeSites(idea).length : 0;
      const label = !existing
        ? "+ Add collection"
        : missing
          ? `+ Add ${missing} more site${missing === 1 ? "" : "s"}`
          : "Added";
      const expanded = expandedIdeas.has(idea.name);
      const hidden = idea.sites.length - IDEA_PREVIEW;
      return h(
        "div",
        { class: `idea${expanded ? " expanded" : ""}`, style: { "--idea-color": idea.color } },
        h("div", { class: "idea-head" }, idea.name, h("span", { class: "line" })),
        h(
          "div",
          { class: "idea-sites" },
          (expanded ? idea.sites : idea.sites.slice(0, IDEA_PREVIEW)).map(site => h("span", {}, favicon(site), site)),
          hidden > 0
            ? h(
                "button",
                {
                  type: "button",
                  class: "link-button",
                  onclick: () => {
                    expanded ? expandedIdeas.delete(idea.name) : expandedIdeas.add(idea.name);
                    renderIdeas();
                  },
                },
                expanded ? "Show fewer" : `+${hidden} more`
              )
            : null
        ),
        ideaNotes.has(idea.name) ? h("p", { class: "muted small" }, ideaNotes.get(idea.name)) : null,
        h(
          "button",
          { type: "button", class: "button", disabled: label === "Added", onclick: () => addIdea(idea) },
          label
        )
      );
    })
  );
}

function renderPreview() {
  const colored = coloredHeaders();
  const keepEmpty = prefs.getBool("zen.sitegroups.keep-empty-headers", false);
  const divider = prefs.getBool("zen.sitegroups.rest-divider", true);
  const arrow = prefs.getString("zen.sitegroups.chevron-position", "right");
  const tabCount = prefs.getString("zen.sitegroups.tab-count", "folded");
  const button = prefs.getString("zen.sitegroups.header-button", "clear");
  const background = prefs.getString("zen.sitegroups.background", "none");
  const preview = document.getElementById("preview");
  preview.classList.toggle("indent", prefs.getBool("zen.sitegroups.indent-tabs", false));
  preview.classList.toggle("group-line", prefs.getBool("zen.sitegroups.group-line", false));
  preview.classList.toggle("no-header-line", !prefs.getBool("zen.sitegroups.header-line", true));
  preview.classList.toggle("bg-header", background === "header" || background === "both");
  preview.classList.toggle("bg-tabs", background === "tabs" || background === "both");
  const rows = [h("div", { class: "p-new" }, "+  New Tab")];
  let first = true;
  for (const section of sections) {
    if (!section.sites.length && !keepEmpty) {
      continue;
    }
    const color = colored ? sectionColor(section) : null;
    const sites = section.sites.slice(0, section.kind === "site" ? 1 : 3);
    rows.push(
      h(
        "div",
        {
          class: `p-header${color ? " colored" : ""}${sites.length ? "" : " empty"}${arrow === "right" ? " arrow-right" : ""}${arrow === "hidden" ? " arrow-hidden" : ""}`,
          style: { "--c": color },
          title: "Hover to see the collapse arrow",
        },
        h("span", { class: "chevron" }),
        h("span", { class: "label" }, displayName(section)),
        tabCount === "always" && sites.length ? h("span", { class: "count" }, String(sites.length)) : null,
        h("span", { class: "line" }),
        button !== "none" && sites.length ? h("span", { class: "action" }, button === "unload" ? "Unload" : "Clear") : null
      )
    );
    if (sites.length) {
      rows.push(
        h(
          "div",
          { class: "p-group", style: { "--c": color } },
          sites.map(site => {
            const title = section.kind === "site" ? displayName(section) : defaultName(site);
            const tab = h("div", { class: `p-tab${first ? " active" : ""}` }, favicon(site), h("span", {}, title));
            first = false;
            return tab;
          })
        )
      );
    }
  }
  if (rows.length > 1 && divider) {
    rows.push(h("div", { class: "p-rest" }));
  }
  rows.push(
    h("div", { class: "p-tab other" }, h("span", { class: "p-dot" }), h("span", {}, "Other tab")),
    h("div", { class: "p-tab other" }, h("span", { class: "p-dot" }), h("span", {}, "Another tab"))
  );
  preview.replaceChildren(...rows);
}

function render() {
  closePopover();
  closeSpacesPopover();
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

/* ---------- options ---------- */

// Every option on the page: switches (true/false) and button groups (one of
// their buttons' values).
const optionControls = () => [...document.querySelectorAll("[data-pref]")];
const isSwitch = el => el.matches("input.switch");

function getOption(el) {
  return isSwitch(el)
    ? prefs.getBool(el.dataset.pref, el.dataset.default === "true")
    : prefs.getString(el.dataset.pref, el.dataset.default);
}

// Ignores values the control can't show (e.g. from a hand-edited backup).
function setOption(el, value) {
  if (isSwitch(el)) {
    if (typeof value === "boolean") {
      prefs.setBool(el.dataset.pref, value);
    }
  } else if ([...el.querySelectorAll("button")].some(b => b.dataset.value === value)) {
    prefs.setString(el.dataset.pref, value);
  }
}

function showOptions() {
  for (const el of optionControls()) {
    const value = getOption(el);
    if (isSwitch(el)) {
      el.checked = value;
    } else {
      el.querySelectorAll("button").forEach(b => b.classList.toggle("selected", b.dataset.value === value));
    }
  }
}

/* ---------- backup ---------- */

const BACKUP_APP = "zen-tab-groups";
const backupNote = document.getElementById("backup-note");
const backupFile = document.getElementById("backup-file");

function noteBackup(text, error = false) {
  backupNote.textContent = text;
  backupNote.classList.toggle("error", error);
  backupNote.hidden = false;
}

// Zen's Save / Open dialog. Resolves to the chosen path, or null if
// cancelled. Throws outside Zen, where the page falls back to web downloads
// and its own file input.
function pickFile(mode, title, defaultName) {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  picker.init(window.browsingContext, title, mode);
  picker.appendFilter("Tab Groups backup", "*.json");
  picker.appendFilters(Ci.nsIFilePicker.filterAll);
  if (defaultName) {
    picker.defaultString = defaultName;
    picker.defaultExtension = "json";
  }
  return new Promise(resolve =>
    picker.open(result => resolve(result === Ci.nsIFilePicker.returnCancel ? null : picker.file.path))
  );
}

async function saveBackup() {
  const options = Object.fromEntries(optionControls().map(el => [el.dataset.pref, getOption(el)]));
  const text = JSON.stringify({ app: BACKUP_APP, format: 1, saved: new Date().toISOString(), sections, options }, null, 2);
  const now = new Date();
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, "0")).join("-");
  const fileName = `tab-groups-backup-${day}.json`;
  let path;
  try {
    path = await pickFile(Ci.nsIFilePicker.modeSave, "Save Tab Groups backup", fileName);
  } catch {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    h("a", { href: url, download: fileName }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    noteBackup(`Downloaded ${fileName}.`);
    return;
  }
  if (!path) {
    return;
  }
  try {
    await IOUtils.writeUTF8(path, text);
    noteBackup(`Saved to ${path}.`);
  } catch (ex) {
    noteBackup(`Couldn't save the backup: ${ex.message}`, true);
  }
}

async function openBackup() {
  let path;
  try {
    path = await pickFile(Ci.nsIFilePicker.modeOpen, "Restore Tab Groups backup");
  } catch {
    backupFile.click();
    return;
  }
  if (!path) {
    return;
  }
  const fileName = PathUtils.filename(path);
  try {
    await restoreBackup(await IOUtils.readUTF8(path), fileName);
  } catch (ex) {
    noteBackup(`Couldn't read ${fileName}: ${ex.message}`, true);
  }
}

async function restoreBackup(text, fileName) {
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (data?.app !== BACKUP_APP || !Array.isArray(data.sections)) {
    noteBackup(`${fileName} isn't a Tab Groups backup.`, true);
    return;
  }
  const restored = parseSections(data.sections);
  const count = `${restored.length} section${restored.length === 1 ? "" : "s"}`;
  if (!(await ask(`Replace your sections and options with the ones in ${fileName} (${count})?`, "Restore"))) {
    return;
  }
  sections = restored;
  save();
  const options = data.options ?? {};
  for (const el of optionControls()) {
    if (Object.hasOwn(options, el.dataset.pref)) {
      setOption(el, options[el.dataset.pref]);
    }
  }
  showOptions();
  render();
  noteBackup(`Restored ${count} and your options from ${fileName}.`);
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
document.getElementById("add-collection").addEventListener("click", addCollection);

document.getElementById("backup-save").addEventListener("click", saveBackup);
document.getElementById("backup-restore").addEventListener("click", openBackup);
backupFile.addEventListener("change", async () => {
  const file = backupFile.files[0];
  backupFile.value = "";
  if (file) {
    await restoreBackup(await file.text(), file.name);
  }
});

for (const group of document.querySelectorAll(".segmented")) {
  group.addEventListener("click", e => {
    const button = e.target.closest("button");
    if (button) {
      prefs.setString(group.dataset.pref, button.dataset.value);
      showOptions();
      renderPreview();
    }
  });
}

for (const toggle of document.querySelectorAll("input.switch")) {
  toggle.addEventListener("change", () => {
    prefs.setBool(toggle.dataset.pref, toggle.checked);
    render();
  });
}

showOptions();

// Changes made elsewhere (right-click menus in the sidebar).
prefs.observe(name => {
  if (name === PREF_SECTIONS && prefs.getString(PREF_SECTIONS, "[]") !== lastSaved) {
    sections = load();
    lastSaved = JSON.stringify(sections);
    renderSoon();
  }
});

render();
