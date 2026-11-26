// ==UserScript==
// @name           Zen Tab Groups
// @description    Pulls tabs from chosen sites to the top of the sidebar, in your order, under colored, collapsible "YouTube ───" headers.
// @include        main
// ==/UserScript==

(() => {
  // Matches the entry this mod has in Settings > Zen Mods (its on/off switch).
  const MOD_ID = "37f70d31-5119-4f39-9b5b-0393dbe9fa4f";
  // This mod's id in Sine (from theme.json).
  const SINE_MOD_ID = "zen-tab-groups";
  // The settings page sits in a "tab-groups" folder next to this script,
  // wherever the mod manager (Sine, fx-autoconfig, ...) installed it.
  const SCRIPT_URL = Components.stack.filename.split(" -> ").pop().replace(/[?#].*$/, "");
  const SETTINGS_URL = new URL("tab-groups/settings.html", SCRIPT_URL).href;

  const PREF_BRANCH = "zen.sitegroups.";
  const PREF_SECTIONS = "zen.sitegroups.sections";
  const PREF_COLLAPSED = "zen.sitegroups.collapsed";
  // "-v3": earlier caches could hold "no color" from Zen's placeholder icon
  // on a fresh profile; old caches are dropped.
  const PREF_ICON_COLORS = "zen.sitegroups.icon-colors-v3";
  const OLD_ICON_COLOR_PREFS = ["zen.sitegroups.icon-colors", "zen.sitegroups.icon-colors-v2"];
  const PREF_REST_DIVIDER = "zen.sitegroups.rest-divider";
  const PREF_KEEP_EMPTY = "zen.sitegroups.keep-empty-headers";
  const PREF_COLORED = "zen.sitegroups.colored-headers";
  const PREF_CHEVRON = "zen.sitegroups.chevron-position"; // "right" | "left" | "hidden"
  const PREF_TAB_MENU = "zen.sitegroups.tab-menu-items";
  const PREF_TAB_COUNT = "zen.sitegroups.tab-count"; // "folded" | "always" | "never"
  const PREF_HEADER_LINE = "zen.sitegroups.header-line";
  const PREF_HEADER_BUTTON = "zen.sitegroups.header-button"; // "clear" | "unload" | "none"
  const PREF_INDENT = "zen.sitegroups.indent-tabs";
  const PREF_GROUP_LINE = "zen.sitegroups.group-line";
  const PREF_BACKGROUND = "zen.sitegroups.background"; // "none" | "header" | "tabs" | "both" | "group"
  const PREF_BG_STRENGTH = "zen.sitegroups.background-strength"; // "4" to "60": % of color in tab backgrounds
  const PREF_COLOR_MODE = "zen.sitegroups.color-mode"; // "section" | "single"
  const PREF_SINGLE_COLOR = "zen.sitegroups.single-color"; // "#rrggbb", with color-mode "single"
  const PREF_READABLE = "zen.sitegroups.readable-text";
  // Zen's "Clear" (close unpinned tabs): above the tabs as usual, on the
  // divider below the sections (closing only the tabs below it), or both.
  const PREF_CLEAR_BUTTON = "zen.sitegroups.clear-button"; // "top" | "divider" | "both"
  // An outline on tabs opened in the background, until they're clicked or
  // for this many seconds. "0" is off, "click" is until clicked.
  const PREF_NEW_TAB = "zen.sitegroups.new-tab-outline";
  const NEW_TAB_CHOICES = ["0", "click", "5", "10", "15", "30", "60"];
  // How much color backgrounds use, as [header %, tabs %]. Headers get a
  // bit more so they stand out from their tabs. Same as the settings page's.
  const strengthPcts = value => {
    const s = Math.min(Math.max(Math.round(Number(value)) || 10, 4), 60);
    return [Math.round(s * 1.25), s];
  };
  // A section only forms once this many of its tabs are open in a space,
  // unless it sets its own number ("1" to "10"; a string, so Sine's options
  // box can offer it as a list).
  const PREF_MIN_TABS = "zen.sitegroups.min-tabs";
  const MAX_MIN_TABS = 10;
  // A site that isn't in any section gets a temporary one of its own once
  // this many of its tabs are open in a space ("0" is off).
  const PREF_AUTO_GROUP = "zen.sitegroups.auto-group";
  const AUTO_GROUP_CHOICES = ["0", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  // Where sections go: all at the top, or where their first tab already is.
  // "mixed": saved sections at the top, automatic ones where their tabs are.
  const PREF_POSITION = "zen.sitegroups.position"; // "top" | "mixed" | "in-place"

  // A section is either one website ("site") or several under a name you
  // pick ("collection"). A website can only belong to one section. `spaces`
  // lists the spaces it's used in (Zen workspace ids); empty means all.
  // `minTabs` is how many of its tabs it takes to form; null means the
  // "Group from" option.
  // Sites that tend to pile up dozens of tabs.
  const DEFAULT_SECTIONS = [
    { kind: "site", name: "YouTube", sites: ["youtube.com"], color: null, spaces: [], minTabs: null },
    { kind: "site", name: "Reddit", sites: ["reddit.com"], color: null, spaces: [], minTabs: null },
    { kind: "site", name: "Wikipedia", sites: ["wikipedia.org"], color: null, spaces: [], minTabs: null },
    { kind: "site", name: "X", sites: ["x.com", "twitter.com"], color: null, spaces: [], minTabs: null },
  ];
  const defaultSections = () => DEFAULT_SECTIONS.map(s => ({ ...s, sites: [...s.sites], spaces: [] }));
  const SPACE_ID = /^\{[0-9a-f-]{36}\}$/i;
  const CONTAINER_TAGS = new Set(["tab-group", "zen-folder", "tab-split-view-wrapper"]);
  const BLANK_PAGES = new Set(["about:blank", "about:newtab", "about:home", "about:privatebrowsing"]);

  const CSS = `
    .zsg-header, .zsg-rest {
      --zsg-line: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
      align-items: center;
      min-height: 26px;
      margin-inline: var(--tab-inline-padding, 4px);
      padding-inline: 8px 6px;
      border-radius: var(--border-radius-medium, 6px);
      -moz-window-dragging: no-drag;
    }
    .zsg-header {
      gap: 6px;
      font-size: small;
      font-weight: 600;
      cursor: default;
    }
    .zsg-header:hover { background: var(--tab-hover-background-color, rgba(128, 128, 128, 0.12)); }
    /* Drawn as a mask in the text's color (as an image it came out black). */
    .zsg-chevron {
      display: none;
      width: 16px;
      height: 16px;
      background-color: currentColor;
      mask: url("chrome://browser/skin/zen-icons/arrow-right.svg") center / 14px 14px no-repeat;
      opacity: 0.75;
      transform: rotate(90deg);
      transition: transform 0.1s;
    }
    .zsg-header:not([zsg-empty]):hover .zsg-chevron,
    .zsg-header[zsg-closed]:not([zsg-empty]) .zsg-chevron { display: flex; }
    .zsg-header[zsg-closed] .zsg-chevron { transform: rotate(0deg); }
    /* Arrow right after the name; the line shrinks to make room. */
    .zsg-header[zsg-chevron-right] {
      .zsg-label { order: 1; }
      .zsg-count { order: 2; }
      .zsg-chevron { order: 3; margin-inline-start: -2px; }
      .zsg-line { order: 4; }
      .zsg-clear { order: 5; }
    }
    .zsg-label { margin: 0; opacity: 0.75; white-space: nowrap; }
    .zsg-count { margin: 0; opacity: 0.45; font-weight: 500; }
    .zsg-header:not([zsg-closed]) .zsg-count { display: none; }
    .zsg-line { flex: 1; height: 1px; background: var(--zsg-line); }
    .zsg-header[zsg-colored] {
      .zsg-label, .zsg-chevron { color: var(--zsg-color); opacity: 1; }
      .zsg-line { background: color-mix(in srgb, var(--zsg-color) 55%, transparent); }
    }
    /* Readable text: colors worked out against the header's background. */
    .zsg-header[zsg-fg] { color: var(--zsg-fg); }
    .zsg-header[zsg-label] :is(.zsg-label, .zsg-chevron) { color: var(--zsg-label); opacity: 1; }
    .zsg-header[zsg-empty] { opacity: 0.55; }
    .zsg-clear {
      display: none;
      margin: 0;
      font-weight: 500;
      opacity: 0.6;
    }
    .zsg-clear:hover { opacity: 1; }
    .zsg-header:not([zsg-empty]):hover .zsg-clear { display: flex; }
    .zsg-rest { min-height: 12px; gap: 6px; }
    .zsg-rest[zsg-no-line] .zsg-line { visibility: hidden; }
    /* Zen's Clear, on the divider (closes the tabs below it). */
    .zsg-rest-clear { display: none; margin: 0; font-size: small; font-weight: 500; opacity: 0.5; cursor: default; }
    .zsg-rest-clear:hover { opacity: 1; }
    .zsg-rest[zsg-clear] { min-height: 22px; }
    .zsg-rest[zsg-clear] .zsg-rest-clear { display: flex; }
    zen-workspace[zsg-clear-moved] .zen-workspace-close-unpinned-tabs-button { display: none !important; }

    /* Header options: tab count, arrow, line and button. */
    :root[zsg-tab-count="always"] .zsg-header:not([zsg-empty]) .zsg-count { display: flex; }
    :root[zsg-tab-count="never"] .zsg-count,
    .zsg-header[zsg-chevron-hidden] .zsg-chevron,
    .zsg-header[zsg-button="none"] .zsg-clear,
    .zsg-header[zsg-button="unload"][zsg-none-loaded] .zsg-clear { display: none !important; }
    :root[zsg-no-header-line] .zsg-header .zsg-line { visibility: hidden; }

    /* Grouped tabs: indented like a folder's (Zen's own indent), a line along
       each group, a tinted background. --zsg-color is the section's color. */
    :root[zsg-group-line] tab[zsg-group] { --zen-folder-indent: 10px; }
    :root[zsg-indent] tab[zsg-group] { --zen-folder-indent: 16px; }
    :root[zsg-group-line][zen-sidebar-expanded="true"] tab[zsg-group]:not([zen-glance-tab]) {
      position: relative;
      overflow: visible;
    }
    :root[zsg-group-line][zen-sidebar-expanded="true"] tab[zsg-group]:not([zen-glance-tab])::after {
      content: "";
      position: absolute;
      inset-block: calc(-1 * var(--tab-margin-block, 2px));
      inset-inline-start: calc(-1 * var(--zen-folder-indent) + 3px);
      width: 2px;
      border-radius: 1px;
      background: var(--zsg-color, var(--zsg-neutral));
      opacity: 0.75;
      pointer-events: none;
    }
    :root[zsg-group-line] tab[zsg-group][zsg-first]::after { inset-block-start: 4px; }
    :root[zsg-group-line] tab[zsg-group][zsg-last]::after { inset-block-end: 4px; }
    /* Backgrounds. --zsg-bg is the section's color (or the text color for
       an uncolored section), --zsg-hpct / --zsg-tpct the strength. */
    .zsg-header, tab[zsg-group] { --zsg-bg: var(--zsg-color, currentColor); }
    :root[zsg-background="header"],
    :root[zsg-background="both"] {
      .zsg-header:not([zsg-empty]) { background: color-mix(in srgb, var(--zsg-bg) var(--zsg-hpct), transparent); }
      .zsg-header:not([zsg-empty]):hover { background: color-mix(in srgb, var(--zsg-bg) calc(var(--zsg-hpct) + 8%), transparent); }
    }
    :root[zsg-background="tabs"],
    :root[zsg-background="both"] {
      tab[zsg-group]:not([visuallyselected], [multiselected]) > .tab-stack > .tab-background {
        background-color: color-mix(in srgb, var(--zsg-bg) var(--zsg-tpct), transparent) !important;
      }
      tab[zsg-group]:not([visuallyselected], [multiselected]):hover > .tab-stack > .tab-background {
        background-color: color-mix(in srgb, var(--zsg-bg) calc(var(--zsg-tpct) + 8%), transparent) !important;
      }
    }
    /* Whole group: one block behind the header and all of its tabs. */
    :root[zsg-background="group"][zen-sidebar-expanded="true"] {
      .zsg-header:not([zsg-empty]) {
        margin: 6px 2px 0;
        padding-inline: 10px 8px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--zsg-bg) var(--zsg-tpct), transparent);
      }
      .zsg-header:not([zsg-empty]):hover { background: color-mix(in srgb, var(--zsg-bg) calc(var(--zsg-tpct) + 8%), transparent); }
      .zsg-header:not([zsg-empty], [zsg-closed]) { border-end-start-radius: 0; border-end-end-radius: 0; }
      tab[zsg-group]:not([zen-glance-tab]) { position: relative; }
      tab[zsg-group]:not([zen-glance-tab])::before {
        content: "";
        position: absolute;
        inset-block: 0;
        inset-inline: 2px;
        background: color-mix(in srgb, var(--zsg-bg) var(--zsg-tpct), transparent);
        pointer-events: none;
        z-index: -1;
      }
      tab[zsg-group][zsg-last]::before { border-end-start-radius: 12px; border-end-end-radius: 12px; }
    }
    /* Readable text on tinted tabs (not the selected one: Zen's own look). */
    tab[zsg-fg]:not([visuallyselected], [multiselected]) :is(.tab-label, .tab-close-button) { color: var(--zsg-fg) !important; }
    :root { --zsg-neutral: light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.25)); }

    :root:not([zen-sidebar-expanded="true"]) {
      .zsg-chevron, .zsg-label, .zsg-count, .zsg-clear, .zsg-rest-clear { display: none !important; }
      .zsg-header { min-height: 12px; }
    }

    /* Dragging a section: it rides above the others, which slide aside. */
    :root[zsg-dragging], :root[zsg-dragging] * { cursor: grabbing !important; }
    :root[zsg-dragging] .zen-workspace-normal-tabs-section > * { pointer-events: none; }
    [zsg-dragged] { position: relative; z-index: 3; }
    :root { --zsg-drag-bg: var(--zen-colors-tertiary, light-dark(#fff, #2b2a33)); }
    .zsg-header[zsg-dragged],
    tab[zsg-dragged] > .tab-stack > .tab-background,
    [zsg-split][zsg-dragged] tab > .tab-stack > .tab-background {
      background: var(--zsg-drag-bg) !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    tab[zsg-dragged]::before { display: none; }
    :root[zsg-dragging] .zsg-header[zsg-dragged] .zsg-clear { display: none; }

    tab[zsg-collapsed]:not([selected], [multiselected]) { display: none !important; }
    [zsg-split][zsg-collapsed]:not(:has(tab[selected], tab[multiselected])) { display: none !important; }

    /* A new tab not looked at yet, and the folded header that hides one. */
    :root { --zsg-new: light-dark(#0060df, #5ce1ff); }
    tab[zsg-new] > .tab-stack > .tab-background,
    .zsg-header[zsg-closed][zsg-new] {
      outline: 2px solid var(--zsg-new) !important;
      outline-offset: -2px;
    }
  `;

  /* ---------- prefs ---------- */

  function readJSON(pref, fallback) {
    try {
      return JSON.parse(Services.prefs.getStringPref(pref));
    } catch {
      return fallback;
    }
  }
  const writeJSON = (pref, value) => Services.prefs.setStringPref(pref, JSON.stringify(value));

  // A website as the sections store it: "youtube.com", or a part of one
  // like "github.com/zen-browser" (its pages and everything below them).
  function normalizeSite(text) {
    const [host, ...path] = String(text ?? "")
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[?#].*$/, "")
      .replace(/^www\./, "")
      .split("/");
    const rest = path.filter(Boolean).join("/");
    return rest ? `${host}/${rest}` : host;
  }

  // The website part of a site ("github.com/zen-browser" -> "github.com").
  const siteHost = site => String(site ?? "").split("/")[0];

  function defaultName(site) {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    // A part of a site is named after its last bit (github.com/you/app -> App).
    const path = site.split("/").slice(1);
    if (path.length) {
      return cap(path.at(-1));
    }
    let base = site;
    try {
      base = Services.eTLD.getBaseDomainFromHost(site);
    } catch {}
    const name = cap(base.split(".")[0]);
    return site === base ? name : `${name} ${cap(site.slice(0, -base.length - 1))}`;
  }

  const displayName = section => section.name?.trim() || defaultName(section.sites[0] ?? "");

  function getSections() {
    const raw = readJSON(PREF_SECTIONS, null);
    if (!Array.isArray(raw)) {
      return defaultSections();
    }
    return raw
      .map(s => ({
        kind: s.kind === "collection" ? "collection" : "site",
        name: String(s.name ?? ""),
        sites: (Array.isArray(s.sites) ? s.sites : []).map(normalizeSite).filter(Boolean),
        color: /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : null,
        spaces: [...new Set((Array.isArray(s.spaces) ? s.spaces : []).filter(id => SPACE_ID.test(id)))],
        minTabs: Number.isInteger(s.minTabs) && s.minTabs >= 1 && s.minTabs <= MAX_MIN_TABS ? s.minTabs : null,
      }))
      .filter(s => s.sites.length || s.kind === "collection");
  }

  // Ids of the browser's spaces, as of the last layout.
  let knownSpaces = new Set();

  // Whether a section is used in the space with this id (null: no spaces).
  // Spaces it lists that don't exist (deleted, or from a backup made on
  // another computer) don't count, and with none left it's used everywhere.
  const inSpace = (section, spaceId) =>
    !spaceId ||
    section.spaces.includes(spaceId) ||
    !section.spaces.some(id => knownSpaces.has(id));

  // The browser's spaces, for the settings page.
  function getSpaces() {
    try {
      return gZenWorkspaces.getWorkspaces().map(w => ({ id: w.uuid, name: w.name, icon: w.icon ?? "" }));
    } catch {
      return [];
    }
  }
  const setSections = sections => writeJSON(PREF_SECTIONS, sections);

  const getCollapsed = () => new Set(readJSON(PREF_COLLAPSED, []));
  const setCollapsed = set => writeJSON(PREF_COLLAPSED, [...set]);

  // Earlier versions kept groups in numbered slots (zen.sitegroups.<n>.name/sites).
  function migrateOldPrefs() {
    if (Services.prefs.prefHasUserValue(PREF_SECTIONS)) {
      return;
    }
    const sections = [];
    let hadOld = false;
    for (let n = 1; n <= 8; n++) {
      const nameKey = `${PREF_BRANCH}${n}.name`;
      const sitesKey = `${PREF_BRANCH}${n}.sites`;
      if (!Services.prefs.prefHasUserValue(nameKey) && !Services.prefs.prefHasUserValue(sitesKey)) {
        continue;
      }
      hadOld = true;
      const name = Services.prefs.getStringPref(nameKey, "").trim();
      let sites = Services.prefs.getStringPref(sitesKey, "").split(/[\s,;]+/).map(normalizeSite).filter(Boolean);
      // youtu.be links redirect to youtube.com, so YouTube stays a single site.
      if (sites.includes("youtube.com")) {
        sites = sites.filter(s => s !== "youtu.be");
      }
      if (name && sites.length) {
        sections.push({ kind: sites.length > 1 ? "collection" : "site", name, sites, color: null });
      }
      Services.prefs.clearUserPref(nameKey);
      Services.prefs.clearUserPref(sitesKey);
    }
    setSections(hadOld ? sections : defaultSections());
  }

  /* ---------- on/off switch in Settings > Zen Mods ---------- */

  let modEnabled = true;
  async function refreshModEnabled() {
    try {
      const mods = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "zen-themes.json"));
      const mod = mods?.[MOD_ID];
      modEnabled =
        !Services.prefs.getBoolPref("zen.themes.disable-all", false) &&
        (!mod || mod.enabled === undefined || mod.enabled);
    } catch {
      modEnabled = true;
    }
  }

  /* ---------- header colors from site icons ---------- */

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) {
      return [0, 0, l];
    }
    const d = max - min;
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToHex(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
      h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const hex = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  /* ---------- readable text ---------- */

  // "#rrggbb", "rgb(a)(…)" or "color(srgb r g b / a)" -> [r, g, b], 0-255.
  function parseColor(value) {
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    }
    const nums = (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
    return value.startsWith("color(") ? nums.map(v => v * 255) : nums;
  }
  const mixRgb = (a, b, share) => a.map((v, i) => v * share + b[i] * (1 - share));
  function luminance(rgb) {
    const [r, g, b] = rgb.map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // `fg`, or `fg` taken toward black or white until it reads on `bg`
  // (null: it already does). Same as the settings page's.
  function readableOn(fg, bg, min) {
    if (contrast(fg, bg) >= min) {
      return null;
    }
    const toward = luminance(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
    let out = fg;
    for (let share = 0.1; share < 1.05 && contrast(out, bg) < min; share += 0.1) {
      out = mixRgb(toward, fg, Math.min(share, 1));
    }
    return "#" + out.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  }

  // Text colors for a section that keep it readable on its backgrounds.
  // The sidebar's own color isn't readable from CSS (themes use gradients),
  // so it's taken as near-black or near-white, the opposite of its text.
  function sectionInk(color, text, opts) {
    const base = luminance(text) > 0.3 ? [32, 32, 36] : [245, 245, 247];
    const [hPct, tPct] = strengthPcts(opts.strength);
    const bg = opts.background;
    const headerPct = bg === "header" || bg === "both" ? hPct : bg === "group" ? tPct : 0;
    const tabPct = bg === "tabs" || bg === "both" || bg === "group" ? tPct : 0;
    const tint = color ? parseColor(color) : text;
    const headerBg = mixRgb(tint, base, headerPct / 100);
    return {
      header: headerPct ? readableOn(text, headerBg, 4.5) : null,
      // Names are bold, so plain headers get the lighter bar for large text.
      label: readableOn(tint, headerBg, headerPct ? 4.5 : 3),
      tabs: tabPct ? readableOn(text, mixRgb(tint, base, tabPct / 100), 4.5) : null,
    };
  }

  function setInk(el, attr, prop, value) {
    el.toggleAttribute(attr, !!value);
    if (value) {
      el.style.setProperty(prop, value);
    } else {
      el.style.removeProperty(prop);
    }
  }

  // Header color from a site icon:
  // - the most common color wins (YouTube: the red, not red mixed with white)
  // - white, grey and near-black pixels never count, so a half white, half
  //   green logo is green
  // - a mostly black/dark logo, or one with almost no color, gets no tint
  //   (null: the sidebar's normal text color)
  // - only when no single shade clearly leads is the color averaged
  function dominantColor(img) {
    const size = 32;
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // No smoothing: blending pixels while scaling invents in-between shades.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    // Count every exact colorful shade (logos use flat colors; gradients
    // spread over many slightly different ones), and its hue family
    // (12 families of 30°, shifted so pure red sits in the middle of one).
    const shades = new Map();
    const families = Array.from({ length: 12 }, () => ({ n: 0, r: 0, g: 0, b: 0 }));
    const add = (into, r, g, b) => {
      into.n++;
      into.r += r;
      into.g += g;
      into.b += b;
    };
    let opaque = 0;
    let dark = 0;
    let colorful = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) {
        continue;
      }
      opaque++;
      const [h, s, l] = rgbToHsl(r, g, b);
      if (l < 0.2) {
        dark++;
        continue;
      }
      if (l > 0.85 || s < 0.25) {
        continue; // white / grey
      }
      colorful++;
      const key = (r << 16) | (g << 8) | b;
      if (!shades.has(key)) {
        shades.set(key, { n: 0, r: 0, g: 0, b: 0 });
      }
      add(shades.get(key), r, g, b);
      add(families[Math.floor(((h + 15) % 360) / 30)], r, g, b);
    }
    if (!opaque || dark / opaque >= 0.75 || colorful / opaque < 0.08) {
      return null;
    }
    // The most common shade, if it clearly leads; otherwise the average of
    // the biggest hue family (counting its neighbours, so a gradient that
    // crosses a family border isn't split in two).
    const [top, second] = [...shades.values()].sort((a, b) => b.n - a.n);
    let pick = top;
    if (second && top.n < second.n * 1.5 && top.n < colorful * 0.25) {
      const score = i => families[i].n + 0.5 * (families[(i + 11) % 12].n + families[(i + 1) % 12].n);
      let best = 0;
      for (let i = 1; i < 12; i++) {
        if (score(i) > score(best)) {
          best = i;
        }
      }
      pick = families[best];
    }
    let [h, s, l] = rgbToHsl(pick.r / pick.n, pick.g / pick.n, pick.b / pick.n);
    // Keep it readable on the sidebar without changing its character.
    l = Math.min(Math.max(l, 0.45), 0.72);
    s = Math.max(s, 0.45);
    return hslToHex(h, s, l);
  }

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new window.Image();
      img.onload = () => resolve(img.naturalWidth ? img : null);
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 5000);
      img.src = src;
    });
  }

  function iconCandidates(site) {
    const list = [];
    // An open tab on exactly this site (not a sub-site: a YouTube Music tab
    // must not lend its icon to YouTube).
    for (const tab of gBrowser.tabs) {
      const host = tabHost(tab);
      const image = tab.getAttribute("image");
      if (image && (host === site || host === "www." + site)) {
        list.push(image);
        break;
      }
    }
    list.push(`page-icon:https://www.${site}/`, `page-icon:https://${site}/`, `https://${site}/favicon.ico`);
    return list;
  }

  // Cached color for a website: "#rrggbb", "" (icon has no clear color),
  // or undefined (not worked out yet).
  // (A part of a site, like github.com/you, uses the website's icon.)
  const cachedIconColor = site => readJSON(PREF_ICON_COLORS, {})[siteHost(site)];

  const colorJobs = new Map();
  // Sites with no trustworthy icon yet; retried once a tab's icon arrives.
  const unsureSites = new Set();
  function retryUnsureColors() {
    for (const site of unsureSites) {
      colorJobs.delete(site);
    }
    unsureSites.clear();
    schedule();
  }
  function iconColor(site) {
    site = siteHost(site);
    const cached = cachedIconColor(site);
    if (cached !== undefined) {
      return Promise.resolve(cached || null);
    }
    if (!colorJobs.has(site)) {
      const job = (async () => {
        let color = null;
        let sure = false; // only a real icon's answer is cached
        for (const src of iconCandidates(site)) {
          const img = await loadImage(src);
          if (!img) {
            continue;
          }
          try {
            color = dominantColor(img);
          } catch {}
          // No color from "page-icon:" may just be Zen's grey placeholder (a
          // site this profile hasn't visited yet), so try the next icon.
          if (color || !src.startsWith("page-icon:")) {
            sure = true;
            break;
          }
        }
        if (sure) {
          writeJSON(PREF_ICON_COLORS, { ...readJSON(PREF_ICON_COLORS, {}), [site]: color ?? "" });
          colorJobs.delete(site);
        } else {
          unsureSites.add(site); // the job stays, so it isn't rerun each layout
        }
        return color;
      })();
      colorJobs.set(site, job);
    }
    return colorJobs.get(site);
  }

  // Color for a section's header, or null. Starts the icon lookup if needed;
  // the header updates when the color cache pref changes.
  function sectionColor(section) {
    if (section.color) {
      return section.color;
    }
    for (const site of section.sites) {
      const cached = cachedIconColor(site);
      if (cached === undefined) {
        iconColor(site);
        return null;
      }
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  /* ---------- matching ---------- */

  // URL a tab is on or about to load. New tabs report about:blank until the
  // page starts loading, so look at what was requested before that.
  const pendingURL = new WeakMap();

  function parseURI(spec) {
    try {
      return Services.io.newURI(spec);
    } catch {
      return null;
    }
  }

  function tabURI(tab) {
    const browser = tab.linkedBrowser;
    const pending = browser && pendingURL.get(browser);
    if (pending) {
      return parseURI(pending);
    }
    let uri = browser?.currentURI;
    if (!uri || BLANK_PAGES.has(uri.spec)) {
      const typed = browser?.userTypedValue;
      const typedURI = typed && /^https?:\/\//i.test(typed) ? parseURI(typed) : null;
      if (typedURI) {
        return typedURI;
      }
      try {
        const lazy = SessionStore.getLazyTabValue(tab, "url");
        if (lazy) {
          uri = parseURI(lazy) ?? uri;
        }
      } catch {}
    }
    return uri;
  }

  // The site each tab was last on. A tab woken from unloaded is on
  // about:blank until its page starts loading (Zen forgets the address it
  // kept for it), so it keeps its site meanwhile: otherwise it leaves its
  // section for a moment, the tabs below it move up, and it comes back at
  // the section's end.
  const lastAddress = new WeakMap();

  // Where a tab is, as website + path in lower case with no query, like
  // "github.com/zen-browser/desktop/issues", or null (about:, file:, etc.).
  function tabAddress(tab) {
    let address = null;
    try {
      const uri = tabURI(tab);
      if (uri?.spec === "about:blank" && lastAddress.has(tab)) {
        return lastAddress.get(tab);
      }
      const host = uri?.host?.toLowerCase();
      if (host) {
        address = host + uri.pathQueryRef.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
      }
    } catch {} // about:, file:, etc.
    if (address) {
      lastAddress.set(tab, address);
    } else {
      lastAddress.delete(tab);
    }
    return address;
  }

  const tabHost = tab => tabAddress(tab)?.split("/")[0] ?? null;

  // Whether an address is on a section's site: the site itself or a
  // sub-site, and for a site with a path, that page or one below it.
  function siteMatches(address, site) {
    const [host, ...path] = address.split("/");
    const [siteDomain, ...sitePath] = site.split("/");
    if (host !== siteDomain && !host.endsWith("." + siteDomain)) {
      return false;
    }
    return sitePath.every((part, i) => path[i] === part);
  }

  // Index of the section whose website matches most specifically, or -1.
  // With `spaceId`, only sections used in that space count.
  function sectionIndexFor(address, sections, spaceId = null) {
    if (!address) {
      return -1;
    }
    let best = -1;
    let bestLen = 0;
    sections.forEach((section, i) => {
      if (spaceId && !inSpace(section, spaceId)) {
        return;
      }
      for (const d of section.sites) {
        if (d.length > bestLen && siteMatches(address, d)) {
          best = i;
          bestLen = d.length;
        }
      }
    });
    return best;
  }

  /* ---------- sidebar layout ---------- */

  const isOurs = el => el.classList.contains("zsg-header") || el.classList.contains("zsg-rest");

  function isContent(el) {
    if (el.localName === "tab") {
      return !el.hasAttribute("zen-empty-tab") && !el.closing && !el.pinned;
    }
    return CONTAINER_TAGS.has(el.localName);
  }

  function nextContent(el) {
    let n = el.nextElementSibling;
    while (n && !isContent(n)) {
      n = n.nextElementSibling;
    }
    return n;
  }

  function makeHeader(label) {
    const header = document.createXULElement("hbox");
    header.className = "zsg-header";
    header.setAttribute("data-label", label);
    header.setAttribute("context", "zsg-header-menu");
    const chevron = document.createXULElement("image");
    chevron.className = "zsg-chevron";
    const text = document.createXULElement("label");
    text.className = "zsg-label";
    const count = document.createXULElement("label");
    count.className = "zsg-count";
    const line = document.createXULElement("hbox");
    line.className = "zsg-line";
    // "Clear" or "Unload", whichever the options pick (updateHeader).
    const clear = document.createXULElement("label");
    clear.className = "zsg-clear";
    header.append(chevron, text, count, line, clear);

    // Keep clicks away from the tab strip (double-click there opens a new tab).
    for (const type of ["mousedown", "dblclick", "auxclick"]) {
      header.addEventListener(type, e => e.stopPropagation());
    }
    header.addEventListener("mousedown", e => pressHeader(header, e));
    header.addEventListener("click", e => {
      e.stopPropagation();
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      if (e.button !== 0 || header.hasAttribute("zsg-empty")) {
        return;
      }
      if (e.target.classList.contains("zsg-clear")) {
        header.getAttribute("zsg-button") === "unload" ? unloadGroup(header) : closeGroup(header);
      } else {
        animated(header.parentElement, () => toggleCollapsed(header.getAttribute("data-label")));
      }
    });
    return header;
  }

  function makeRestDivider() {
    const rest = document.createXULElement("hbox");
    rest.className = "zsg-rest";
    const line = document.createXULElement("hbox");
    line.className = "zsg-line";
    const clear = document.createXULElement("label");
    clear.className = "zsg-rest-clear";
    clear.setAttribute("value", "Clear");
    clear.setAttribute("tooltiptext", "Close the tabs below (the ones not in a section)");
    rest.append(line, clear);
    for (const type of ["mousedown", "dblclick", "auxclick"]) {
      rest.addEventListener(type, e => e.stopPropagation());
    }
    rest.addEventListener("click", e => {
      e.stopPropagation();
      if (e.button === 0 && e.target === clear) {
        closeRest(rest);
      }
    });
    return rest;
  }

  const BUTTONS = {
    clear: ["Clear", "Close the tabs in this section (keeps the one you're on; click again to close it too)"],
    unload: ["Unload", "Unload all tabs in this section"],
  };

  // A tab whose page is loaded (not unloaded, and not waiting to load).
  const isLoaded = tab => !tab.hasAttribute("pending");

  function setColor(el, color) {
    if (color) {
      el.style.setProperty("--zsg-color", color);
    } else {
      el.style.removeProperty("--zsg-color");
    }
  }

  // A section's color: its own (picked or from its icon), the one color
  // for all, or null with colors off.
  function colorFor(section, opts) {
    if (!opts.colored) {
      return null;
    }
    return opts.colorMode === "single" ? opts.singleColor : sectionColor(section);
  }

  function updateHeader(header, section, tabs, opts, look) {
    const label = displayName(section);
    header.querySelector(".zsg-label").setAttribute("value", label);
    header.querySelector(".zsg-count").setAttribute("value", String(tabs.length));
    header.toggleAttribute("zsg-closed", tabs.length > 0 && opts.collapsed.has(label));
    header.toggleAttribute("zsg-empty", !tabs.length);
    header.toggleAttribute("zsg-chevron-right", opts.chevron === "right");
    header.toggleAttribute("zsg-chevron-hidden", opts.chevron === "hidden");
    header.setAttribute("zsg-button", opts.button);
    header.toggleAttribute("zsg-none-loaded", !tabs.some(isLoaded));
    header.toggleAttribute("zsg-new", tabs.some(t => t.hasAttribute("zsg-new")));
    const [text, tooltip] = BUTTONS[opts.button] ?? BUTTONS.clear;
    const button = header.querySelector(".zsg-clear");
    button.setAttribute("value", text);
    button.setAttribute("tooltiptext", tooltip);
    header.toggleAttribute("zsg-auto", !!section.auto);
    if (section.auto) {
      header.setAttribute("data-site", section.sites[0]);
    } else {
      header.removeAttribute("data-site");
    }
    header.toggleAttribute("zsg-colored", !!look.color);
    setColor(header, look.color);
    setInk(header, "zsg-fg", "--zsg-fg", look.ink?.header);
    setInk(header, "zsg-label", "--zsg-label", look.ink?.label);
  }

  function ungroup(tab) {
    for (const name of ["zsg-group", "zsg-collapsed", "zsg-first", "zsg-last"]) {
      tab.removeAttribute(name);
    }
    tab.style.removeProperty("--zsg-color");
    setInk(tab, "zsg-fg", "--zsg-fg", null);
  }

  // A split view: Zen keeps its tabs together in one box in the tab list.
  const isSplit = el =>
    (el.localName === "tab-group" && el.hasAttribute("split-view-group")) || el.localName === "tab-split-view-wrapper";

  function ungroupSplit(el) {
    el.removeAttribute("zsg-split");
    el.removeAttribute("zsg-collapsed");
    for (const tab of el.querySelectorAll("tab")) {
      ungroup(tab);
    }
  }

  const splitTabs = el => [...el.querySelectorAll("tab")].filter(t => !t.closing);

  // Temporary sections for sites that aren't in a section but have at least
  // `min` tabs open in this space, in the order their first tab comes.
  // Automatic sections formed last time, by space: they stay until they're
  // down to one tab, so closing a tab or two doesn't break one up.
  const autoFormed = new Map();

  function autoSections(content, sections, spaceId, min) {
    const counts = new Map();
    for (const el of content) {
      const tabs = isSplit(el) ? splitTabs(el) : el.localName === "tab" ? [el] : [];
      for (const tab of tabs) {
        const address = tabAddress(tab);
        if (address && sectionIndexFor(address, sections, spaceId) < 0) {
          const site = siteForHost(siteHost(address));
          counts.set(site, (counts.get(site) ?? 0) + 1);
        }
      }
    }
    // A name that two sites would share (example.com and example.net), or
    // that a section already has, becomes the full address for all of them,
    // so names don't change with which tab comes first.
    const names = new Set(sections.map(displayName));
    const before = autoFormed.get(spaceId) ?? new Set();
    const formed = [...counts].filter(([site, n]) => n >= (before.has(site) ? 2 : min)).map(([site]) => site);
    autoFormed.set(spaceId, new Set(formed));
    const shared = new Map();
    for (const site of formed) {
      shared.set(defaultName(site), (shared.get(defaultName(site)) ?? 0) + 1);
    }
    const autos = [];
    for (const site of formed) {
      const short = defaultName(site);
      const name = names.has(short) || shared.get(short) > 1 ? site : "";
      const section = { kind: "site", name, sites: [site], color: null, spaces: [], minTabs: 1, auto: true };
      if (!names.has(displayName(section))) {
        names.add(displayName(section));
        autos.push(section);
      }
    }
    return autos;
  }

  // Each floating section's anchor tab, by space and section name.
  const anchors = new Map();

  // Lays out one space's tabs. Returns the tabs it put in a section.
  function layoutSection(container, sections, opts) {
    const spaceId = container.getAttribute("zen-workspace-id");
    const content = [...container.children].filter(isContent);
    if (opts.autoGroup) {
      sections = sections.concat(autoSections(content, sections, spaceId, opts.autoGroup));
    } else {
      autoFormed.delete(spaceId);
    }
    // A floating section stays where its first tab is; the others go on top.
    // "mixed" floats only the automatic ones (saved sections stay on top).
    const floats = si => opts.position === "in-place" || (opts.position === "mixed" && !!sections[si].auto);
    const anchorKey = si => `${spaceId}|${sections[si].auto ? sections[si].sites[0] : displayName(sections[si])}`;
    // Each entry is a tab, or a split view that moves as one (it joins the
    // section of its first tab that has one).
    let grouped = [];
    for (const el of content) {
      const split = isSplit(el);
      if (el.localName !== "tab" && !split) {
        continue; // folders keep their tabs
      }
      const tabs = split ? [...el.querySelectorAll("tab")].filter(t => !t.closing) : [el];
      let si = -1;
      for (const tab of tabs) {
        si = sectionIndexFor(tabAddress(tab), sections, spaceId);
        if (si >= 0) {
          break;
        }
      }
      if (si >= 0 && tabs.length) {
        grouped.push({ el, tabs, si, split });
      } else {
        split ? ungroupSplit(el) : ungroup(el);
      }
    }
    // Sections with fewer tabs than their minimum don't form: their tabs stay
    // where they are.
    const counts = new Map();
    for (const { si, tabs } of grouped) {
      counts.set(si, (counts.get(si) ?? 0) + tabs.length);
    }
    grouped = grouped.filter(({ el, si, split }) => {
      if (counts.get(si) >= (sections[si].minTabs ?? opts.minTabs)) {
        return true;
      }
      split ? ungroupSplit(el) : ungroup(el);
      return false;
    });
    // Sections on top come first, in section order. Floating ones follow in
    // the order they come in the list, each where its anchor is (its first
    // tab last time): a new tab opened above a section joins it at the end
    // instead of pulling the whole section up. Sorting is stable, so tabs
    // keep their order within a section.
    const firstAt = new Map();
    const anchorAt = new Map();
    grouped.forEach((g, i) => {
      firstAt.has(g.si) || firstAt.set(g.si, i);
      if (floats(g.si) && g.tabs.includes(anchors.get(anchorKey(g.si)))) {
        anchorAt.set(g.si, i);
      }
    });
    const sortKey = (g, i) => {
      if (!floats(g.si)) {
        return [0, g.si, 0];
      }
      const at = anchorAt.get(g.si) ?? firstAt.get(g.si);
      return [1, at, i < at ? 1 : 0];
    };
    const byKey = (a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2];
    grouped = grouped
      .map((g, i) => ({ g, k: sortKey(g, i) }))
      .sort(byKey)
      .map(({ g }) => g);
    const anchored = new Set();
    for (const g of grouped) {
      if (floats(g.si) && !anchored.has(g.si)) {
        anchored.add(g.si);
        anchors.set(anchorKey(g.si), g.tabs[0]);
      }
    }
    // Each section's color, and text colors that read on its backgrounds.
    const text = parseColor(getComputedStyle(container).color);
    const looks = new Map();
    const lookFor = si => {
      if (!looks.has(si)) {
        const color = colorFor(sections[si], opts);
        looks.set(si, { color, ink: opts.readable ? sectionInk(color, text, opts) : null });
      }
      return looks.get(si);
    };
    grouped.forEach(({ el, tabs, si, split }, i) => {
      const label = displayName(sections[si]);
      const collapsed = opts.collapsed.has(label);
      const look = lookFor(si);
      // A folded section hides a split view as a whole (CSS), not tab by tab.
      if (split) {
        el.setAttribute("zsg-split", label);
        el.toggleAttribute("zsg-collapsed", collapsed);
      }
      tabs.forEach((tab, j) => {
        tab.setAttribute("zsg-group", label);
        tab.toggleAttribute("zsg-collapsed", collapsed && !split);
        tab.toggleAttribute("zsg-first", j === 0 && grouped[i - 1]?.si !== si);
        tab.toggleAttribute("zsg-last", j === tabs.length - 1 && grouped[i + 1]?.si !== si);
        setColor(tab, look.color);
        setInk(tab, "zsg-fg", "--zsg-fg", look.ink?.tabs);
      });
    });

    // 1. Move the sections on top to the top, in section order, and gather
    // each floating section's tabs after its first one. A split view moves
    // as one: Zen moves the whole box when asked to move one of its tabs.
    let prev = null;
    let lastTop = null;
    for (const g of grouped) {
      const { el, tabs, si } = g;
      try {
        if (floats(si)) {
          if (prev?.si === si && nextContent(prev.el) !== el) {
            gBrowser.moveTabAfter(tabs[0], prev.tabs.at(-1));
          }
        } else if (!lastTop) {
          const first = [...container.children].find(isContent);
          if (first && first !== el) {
            gBrowser.moveTabBefore(tabs[0], isSplit(first) ? first.querySelector("tab") : first);
          }
        } else if (nextContent(lastTop.el) !== el) {
          gBrowser.moveTabAfter(tabs[0], lastTop.tabs.at(-1));
        }
      } catch (ex) {
        console.error("[Zen Tab Groups] move failed", ex);
      }
      prev = g;
      if (!floats(si)) {
        lastTop = g;
      }
    }

    // 2. A header above each section (also empty ones, if enabled).
    const existing = new Map();
    for (const el of container.children) {
      if (el.classList.contains("zsg-header")) {
        existing.set(el.getAttribute("data-label"), el);
      }
    }
    const keep = new Set();
    let last = null; // last element of the sections on top so far
    const emptyHeaders = []; // all in place: these go at the very top
    const ends = []; // each floating section's last element
    sections.forEach((section, si) => {
      const members = grouped.filter(g => g.si === si);
      const tabs = members.flatMap(g => g.tabs);
      if ((!tabs.length && !opts.keepEmpty) || !inSpace(section, spaceId)) {
        return;
      }
      const label = displayName(section);
      if (keep.has(existing.get(label))) {
        return; // two sections with the same name: the first one wins
      }
      const header = existing.get(label) ?? makeHeader(label);
      updateHeader(header, section, tabs, opts, lookFor(si));
      header.toggleAttribute("zsg-float", !!tabs.length && floats(si));

      if (tabs.length) {
        if (header.nextElementSibling !== members[0].el) {
          container.insertBefore(header, members[0].el);
        }
        if (floats(si)) {
          ends.push({ label, el: members.at(-1).el });
        } else {
          last = members.at(-1).el;
        }
      } else if (opts.position === "in-place") {
        emptyHeaders.push(header);
      } else if (last) {
        if (last.nextElementSibling !== header) {
          last.after(header);
        }
        last = header;
      } else {
        // Nothing placed yet: go first. (The new-tab button row is always
        // the container's last child, so never insert after it.)
        const anchor =
          [...container.children].find(isContent) ??
          container.querySelector(":scope > #tabbrowser-arrowscrollbox-periphery");
        if (anchor && header.nextElementSibling !== anchor) {
          container.insertBefore(header, anchor);
        }
        last = header;
      }
      keep.add(header);
    });

    // In place, headers of sections with no tabs open go at the very top.
    if (emptyHeaders.length) {
      let ref =
        [...container.children].find(el => isContent(el) || (keep.has(el) && !emptyHeaders.includes(el))) ??
        container.querySelector(":scope > #tabbrowser-arrowscrollbox-periphery");
      for (const header of emptyHeaders.reverse()) {
        if (header.nextElementSibling !== ref) {
          container.insertBefore(header, ref);
        }
        ref = header;
      }
    }

    // 3. A plain line between the sections on top and everything else, with
    // Zen's Clear on it if picked (then just the button if the line is off),
    // and a line (no button) closing each floating section that tabs follow.
    const groupedEls = new Set(grouped.map(g => g.el));
    if (opts.restDivider) {
      for (const { label, el } of ends) {
        const next = nextContent(el);
        if (!next || groupedEls.has(next) || opts.collapsed.has(label)) {
          continue; // the end of the list, the next section's header, or folded
        }
        const end = [...container.children].find(e => e.getAttribute("data-end") === label) ?? makeRestDivider();
        end.setAttribute("data-end", label);
        end.removeAttribute("zsg-clear");
        end.removeAttribute("zsg-no-line");
        if (end.nextElementSibling !== next) {
          container.insertBefore(end, next);
        }
        keep.add(end);
      }
    }
    const clearHere = opts.clearButton !== "top";
    if (last && (opts.restDivider || clearHere)) {
      let ref = nextContent(last);
      // A floating section right below: the line goes above its header.
      if (ref && groupedEls.has(ref) && ref.previousElementSibling?.classList.contains("zsg-header")) {
        ref = ref.previousElementSibling;
      }
      if (ref) {
        let rest = [...container.children].find(el => el.classList.contains("zsg-rest") && !el.hasAttribute("data-end"));
        rest ??= makeRestDivider();
        if (rest.nextElementSibling !== ref) {
          container.insertBefore(rest, ref);
        }
        rest.toggleAttribute("zsg-no-line", !opts.restDivider);
        rest.toggleAttribute("zsg-clear", clearHere);
        keep.add(rest);
      }
    }
    // Zen's own Clear (above the tabs) goes away when it's on the divider
    // only, as long as there are sections on top; without any, it stays.
    container.closest("zen-workspace")?.toggleAttribute("zsg-clear-moved", !!last && opts.clearButton === "divider");

    for (const el of [...container.children]) {
      if (isOurs(el) && !keep.has(el)) {
        el.remove();
      }
    }
    return grouped.flatMap(({ tabs }) => tabs);
  }

  // Options that style tabs and headers through attributes on the window.
  function applyLook(opts) {
    const root = document.documentElement;
    root.setAttribute("zsg-tab-count", opts.tabCount);
    root.setAttribute("zsg-background", opts.background);
    const [hPct, tPct] = strengthPcts(opts.strength);
    root.style.setProperty("--zsg-hpct", hPct + "%");
    root.style.setProperty("--zsg-tpct", tPct + "%");
    root.toggleAttribute("zsg-no-header-line", !opts.headerLine);
    root.toggleAttribute("zsg-indent", opts.indent);
    root.toggleAttribute("zsg-group-line", opts.groupLine);
  }

  const choice = (pref, fallback, values) => {
    const value = Services.prefs.getStringPref(pref, fallback);
    return values.includes(value) ? value : fallback;
  };

  // Lay out before the next paint, so new tabs never flash in the wrong spot.
  let frame = null;
  let retry = null;
  function schedule() {
    if (frame === null) {
      frame = requestAnimationFrame(run);
    }
  }

  function run() {
    frame = null;
    // Don't fight the user mid-drag (a tab, or one of our sections).
    if (gBrowser.tabContainer.hasAttribute("movingtab") || drag) {
      clearTimeout(retry);
      retry = setTimeout(schedule, 300);
      return;
    }
    try {
      // Switched off in Settings: an empty list strips everything back out.
      const sections = modEnabled ? getSections() : [];
      const opts = {
        collapsed: getCollapsed(),
        keepEmpty: Services.prefs.getBoolPref(PREF_KEEP_EMPTY, false),
        restDivider: Services.prefs.getBoolPref(PREF_REST_DIVIDER, true),
        colored: Services.prefs.getBoolPref(PREF_COLORED, true),
        chevron: choice(PREF_CHEVRON, "right", ["right", "left", "hidden"]),
        tabCount: choice(PREF_TAB_COUNT, "folded", ["folded", "always", "never"]),
        headerLine: Services.prefs.getBoolPref(PREF_HEADER_LINE, true),
        button: choice(PREF_HEADER_BUTTON, "clear", ["clear", "unload", "none"]),
        indent: Services.prefs.getBoolPref(PREF_INDENT, false),
        groupLine: Services.prefs.getBoolPref(PREF_GROUP_LINE, false),
        background: choice(PREF_BACKGROUND, "none", ["none", "header", "tabs", "both", "group"]),
        strength: Services.prefs.getStringPref(PREF_BG_STRENGTH, "10"),
        colorMode: choice(PREF_COLOR_MODE, "section", ["section", "single"]),
        singleColor: /^#[0-9a-f]{6}$/i.test(Services.prefs.getStringPref(PREF_SINGLE_COLOR, ""))
          ? Services.prefs.getStringPref(PREF_SINGLE_COLOR)
          : "#4da3ff",
        readable: Services.prefs.getBoolPref(PREF_READABLE, true),
        clearButton: choice(PREF_CLEAR_BUTTON, "top", ["top", "divider", "both"]),
        minTabs: Number(choice(PREF_MIN_TABS, "1", Array.from({ length: MAX_MIN_TABS }, (_, i) => String(i + 1)))),
        autoGroup: modEnabled ? Number(choice(PREF_AUTO_GROUP, "0", AUTO_GROUP_CHOICES)) : 0,
        position: choice(PREF_POSITION, "top", ["top", "mixed", "in-place"]),
      };
      applyLook(opts);
      knownSpaces = new Set(getSpaces().map(s => s.id));
      const grouped = new Set();
      for (const container of document.querySelectorAll(".zen-workspace-normal-tabs-section")) {
        layoutSection(container, sections, opts).forEach(tab => grouped.add(tab));
      }
      // Tabs that left a space's list (pinned or put in a folder) keep
      // nothing of their section, so a folded one isn't hidden.
      for (const tab of gBrowser.tabs) {
        if (!grouped.has(tab) && tab.hasAttribute("zsg-group")) {
          ungroup(tab);
        }
      }
      for (const el of document.querySelectorAll("[zsg-split]")) {
        if (![...el.querySelectorAll("tab")].some(tab => grouped.has(tab))) {
          ungroupSplit(el);
        }
      }
    } catch (ex) {
      console.error("[Zen Tab Groups]", ex);
    }
  }

  /* ---------- moving sections by dragging their header ---------- */

  const EASE = "cubic-bezier(0.2, 0, 0, 1)";
  const SLIDE_MS = 160;
  const SETTLE_MS = 200;

  let drag = null; // the drag going on, if any
  let pressed = null; // a header pressed but not dragged far enough yet
  let swallowClick = false; // the click that ends a drag doesn't fold it

  // Lay out right away (in this frame), for changes the user made.
  function layoutNow() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    run();
  }

  // The things in a space's tab list a section can be dragged past, top to
  // bottom: each section (header, tabs and end line) and each other tab,
  // split view or folder. Only ones of the same `kind` trade places: saved
  // sections on top ("top"), automatic ones on top ("auto"), or floating
  // sections and the tabs around them ("float").
  function dragUnits(container) {
    const units = [];
    const kids = [...container.children];
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (el.classList.contains("zsg-header")) {
        const label = el.getAttribute("data-label");
        const kind = el.hasAttribute("zsg-float") ? "float" : el.hasAttribute("zsg-auto") ? "auto" : "top";
        const unit = { header: el, els: [el], content: [], kind };
        while (i + 1 < kids.length) {
          const next = kids[i + 1];
          if ((next.localName === "tab" && next.getAttribute("zsg-group") === label) || next.getAttribute("zsg-split") === label) {
            unit.els.push(next);
            unit.content.push(next);
          } else if (next.getAttribute("data-end") === label) {
            unit.els.push(next);
          } else {
            break;
          }
          i++;
        }
        units.push(unit);
      } else if (isContent(el) && !el.hasAttribute("zsg-group") && !el.hasAttribute("zsg-split")) {
        units.push({ header: null, els: [el], content: [el], kind: "float" });
      }
    }
    return units;
  }

  // Where a unit is on screen (its visible parts), or null if hidden.
  function unitBox(unit) {
    const rects = unit.els.map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
    return rects.length ? { top: rects[0].top, bottom: rects.at(-1).bottom } : null;
  }

  const scrollerOf = container => container.closest("arrowscrollbox")?.scrollbox ?? null;

  function startDrag(header, startY) {
    const container = header.parentElement;
    const all = dragUnits(container);
    const unit = all.find(u => u.header === header);
    if (!unit || header.hasAttribute("zsg-empty") && unit.kind === "float") {
      return false;
    }
    const items = all.filter(u => u.kind === unit.kind);
    for (const u of items) {
      u.box = unitBox(u);
    }
    const shown = items.filter(u => u.box);
    const index = shown.indexOf(unit);
    if (index < 0 || shown.length < 2) {
      return false;
    }
    // Each one's slot: from its top to the next one's top, so gaps stay.
    const gap = Math.max(0, shown[1].box.top - shown[0].box.bottom);
    shown.forEach((u, i) => {
      u.size = i + 1 < shown.length ? shown[i + 1].box.top - u.box.top : u.box.bottom - u.box.top + gap;
    });
    const scroller = scrollerOf(container);
    drag = {
      container,
      unit,
      items: shown,
      index,
      target: index,
      startY,
      y: startY,
      startScroll: scroller?.scrollTop ?? 0,
      scroller,
      minDy: shown[0].box.top - unit.box.top,
      maxDy: shown.at(-1).box.top + shown.at(-1).size - (unit.box.top + unit.size),
      raf: null,
    };
    for (const u of shown) {
      for (const el of u.els) {
        el.style.transition = u === unit ? "none" : `transform ${SLIDE_MS}ms ${EASE}`;
      }
    }
    for (const el of unit.els) {
      el.setAttribute("zsg-dragged", "");
    }
    document.documentElement.setAttribute("zsg-dragging", "");
    autoScroll();
    return true;
  }

  function updateDrag() {
    const d = drag;
    const scrolled = (d.scroller?.scrollTop ?? 0) - d.startScroll;
    const dy = Math.min(Math.max(d.y - d.startY + scrolled, d.minDy), d.maxDy);
    // Something trades places once the dragged section's leading edge passes
    // its middle (its top edge going up, its bottom edge going down).
    const top = d.unit.box.top + dy;
    const bottom = top + d.unit.size;
    let target = d.index;
    d.items.forEach((u, i) => {
      let shift = 0;
      if (i < d.index && top < u.box.top + u.size / 2) {
        shift = d.unit.size;
        target = Math.min(target, i);
      } else if (i > d.index && bottom > u.box.top + u.size / 2) {
        shift = -d.unit.size;
        target = Math.max(target, i);
      }
      if (u !== d.unit) {
        for (const el of u.els) {
          el.style.transform = shift ? `translateY(${shift}px)` : "";
        }
      }
    });
    for (const el of d.unit.els) {
      el.style.transform = `translateY(${dy}px)`;
    }
    d.target = target;
  }

  // Scrolls the tab list while the pointer is near its top or bottom edge.
  function autoScroll() {
    const d = drag;
    if (!d) {
      return;
    }
    if (d.scroller) {
      const box = d.scroller.getBoundingClientRect();
      const edge = 36;
      const speed =
        d.y < box.top + edge ? -Math.ceil((box.top + edge - d.y) / 4) : d.y > box.bottom - edge ? Math.ceil((d.y - box.bottom + edge) / 4) : 0;
      if (speed) {
        const before = d.scroller.scrollTop;
        d.scroller.scrollTop += speed;
        if (d.scroller.scrollTop !== before) {
          updateDrag();
        }
      }
    }
    d.raf = requestAnimationFrame(autoScroll);
  }

  // Where each of a space's elements is on screen now.
  function snapshot(container) {
    const tops = new Map();
    for (const el of container.children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) {
        tops.set(el, r.top);
      }
    }
    return tops;
  }

  // Slides everything from where it was (`before`) to where it is now, so a
  // change never jumps. New ones (an end line, unfolded tabs) fade in.
  function settle(container, before) {
    const moved = [];
    for (const el of container.children) {
      const r = el.getBoundingClientRect();
      if (!r.height) {
        continue;
      }
      el.style.transition = "none";
      if (before.has(el)) {
        const delta = before.get(el) - r.top;
        if (Math.abs(delta) < 0.5) {
          el.style.transition = "";
          continue;
        }
        el.style.transform = `translateY(${delta}px)`;
      } else {
        el.style.opacity = "0"; // new, or shown again (unfolded)
      }
      moved.push(el);
    }
    if (!moved.length) {
      return;
    }
    container.getBoundingClientRect(); // apply the start positions first
    for (const el of moved) {
      el.style.transition = `transform ${SETTLE_MS}ms ${EASE}, opacity ${SETTLE_MS}ms ${EASE}`;
      el.style.transform = "";
      el.style.opacity = "";
    }
    setTimeout(() => {
      for (const el of moved) {
        if (!drag?.unit.els.includes(el)) {
          el.style.transition = "";
        }
      }
    }, SETTLE_MS + 50);
  }

  // Runs a change to the sections (a pref or tab moves), lays out at once,
  // and slides everything in that space into its new place.
  function animated(container, change) {
    if (!container?.isConnected) {
      change();
      return;
    }
    const before = snapshot(container);
    change();
    layoutNow();
    settle(container, before);
  }

  const firstTab = el => (isSplit(el) ? el.querySelector("tab") : el);
  const lastTab = el => (isSplit(el) ? [...el.querySelectorAll("tab")].at(-1) : el);

  // Puts the dragged section where it was dropped.
  function applyDrop(d) {
    const order = [...d.items];
    order.splice(d.target, 0, ...order.splice(d.index, 1));
    if (d.unit.kind === "top") {
      // Saved sections: the new order goes into the list of sections. Ones
      // not shown here (other spaces, no tabs) keep their places.
      const sections = getSections();
      const picks = order
        .map(u => sections.findIndex(s => displayName(s) === u.header.getAttribute("data-label")))
        .filter(i => i >= 0);
      const slots = [...picks].sort((a, b) => a - b);
      const result = [...sections];
      slots.forEach((slot, k) => (result[slot] = sections[picks[k]]));
      setSections(result);
      return;
    }
    // The others: their tabs move next to the ones they were dropped by.
    const before = order[d.target - 1];
    const after = order[d.target + 1];
    if (before) {
      let anchor = before.content.at(-1);
      for (const el of d.unit.content) {
        gBrowser.moveTabAfter(firstTab(el), isSplit(anchor) ? lastTab(anchor) : anchor);
        anchor = el;
      }
    } else if (after) {
      const target = after.content[0];
      for (const el of d.unit.content) {
        gBrowser.moveTabBefore(firstTab(el), isSplit(target) ? firstTab(target) : target);
      }
    }
  }

  function endDrag(commit) {
    const d = drag;
    if (!d) {
      return;
    }
    cancelAnimationFrame(d.raf);
    const els = d.items.flatMap(u => u.els);
    const cleanUp = () => {
      for (const el of els) {
        el.removeAttribute("zsg-dragged");
      }
      document.documentElement.removeAttribute("zsg-dragging");
    };
    if (!commit || d.target === d.index) {
      // Glide back.
      for (const el of els) {
        el.style.transition = `transform ${SETTLE_MS}ms ${EASE}`;
        el.style.transform = "";
      }
      drag = null;
      cleanUp();
      setTimeout(() => els.forEach(el => el.isConnected && !drag && (el.style.transition = "")), SETTLE_MS + 50);
      schedule();
      return;
    }
    const before = snapshot(d.container);
    for (const el of els) {
      el.style.transition = "none";
      el.style.transform = "";
    }
    drag = null;
    cleanUp();
    try {
      applyDrop(d);
    } catch (ex) {
      console.error("[Zen Tab Groups] drop failed", ex);
    }
    layoutNow();
    settle(d.container, before);
  }

  function onDragMove(e) {
    if (pressed && !drag) {
      if (Math.abs(e.clientY - pressed.y) < 5) {
        return;
      }
      const header = pressed.header;
      const y = pressed.y;
      pressed = null;
      if (!startDrag(header, y)) {
        stopListening();
        return;
      }
    }
    if (drag) {
      drag.y = e.clientY;
      updateDrag();
    }
  }

  function onDragUp() {
    stopListening();
    pressed = null;
    if (drag) {
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
      endDrag(true);
    }
  }

  function onDragKey(e) {
    if (e.key === "Escape" && drag) {
      e.preventDefault();
      e.stopPropagation();
      stopListening();
      endDrag(false);
    }
  }

  function onDragCancel() {
    stopListening();
    pressed = null;
    endDrag(false);
  }

  function stopListening() {
    window.removeEventListener("mousemove", onDragMove, true);
    window.removeEventListener("mouseup", onDragUp, true);
    window.removeEventListener("keydown", onDragKey, true);
    window.removeEventListener("blur", onDragCancel);
  }

  function pressHeader(header, e) {
    if (e.button !== 0 || drag || e.target.classList.contains("zsg-clear") || gBrowser.tabContainer.hasAttribute("movingtab")) {
      return;
    }
    pressed = { header, y: e.clientY };
    window.addEventListener("mousemove", onDragMove, true);
    window.addEventListener("mouseup", onDragUp, true);
    window.addEventListener("keydown", onDragKey, true);
    window.addEventListener("blur", onDragCancel);
  }

  /* ---------- actions ---------- */

  function toggleCollapsed(label) {
    const set = getCollapsed();
    set.has(label) ? set.delete(label) : set.add(label);
    setCollapsed(set); // pref observer re-runs layout
  }

  function groupTabs(header) {
    const label = header.getAttribute("data-label");
    return [...header.parentElement.children]
      .flatMap(el => (isSplit(el) ? [...el.querySelectorAll("tab")] : [el]))
      .filter(el => el.localName === "tab" && el.getAttribute("zsg-group") === label);
  }

  // Like Zen's own Clear: the tab you're on stays open, unless it's the
  // only one left (so a second click closes it too).
  function clearTabs(tabs) {
    if (tabs.length > 1) {
      tabs = tabs.filter(tab => !tab.selected && !tab.multiselected);
    }
    if (tabs.length) {
      gBrowser.removeTabs(tabs);
    }
  }

  // The divider's Clear: the tabs below it, which aren't in a section
  // (folders and split views are left alone, like Zen's own Clear).
  function closeRest(rest) {
    clearTabs(
      [...rest.parentElement.children].filter(
        el => el.localName === "tab" && !el.hasAttribute("zsg-group") && !el.pinned
      )
    );
  }

  // The header's Clear keeps the tab you're on; the menu's "Close all tabs"
  // closes every one.
  function closeGroup(header, all = false) {
    const tabs = groupTabs(header);
    all ? gBrowser.removeTabs(tabs) : clearTabs(tabs);
  }

  // Like a folder's unload button: the tabs stay, their pages are unloaded
  // (Zen picks another tab first if the selected one is among them).
  function unloadGroup(header) {
    const tabs = groupTabs(header).filter(isLoaded);
    if (tabs.length) {
      gBrowser.explicitUnloadTabs(tabs);
    }
  }

  function openSettings() {
    const existing = gBrowser.tabs.find(t => t.linkedBrowser?.currentURI?.spec === SETTINGS_URL);
    gBrowser.selectedTab = existing ?? gBrowser.addTrustedTab(SETTINGS_URL);
  }

  function promptText(title, message, initial) {
    const value = { value: initial };
    return Services.prompt.prompt(window, title, message, value, null, {}) ? value.value.trim() : null;
  }

  // The site to group for a tab: the main site (en.wikipedia.org ->
  // wikipedia.org), except for real sub-sites like music.youtube.com.
  function siteForHost(host) {
    const site = normalizeSite(host);
    let base = site;
    try {
      base = Services.eTLD.getBaseDomainFromHost(site);
    } catch {
      return site;
    }
    const sub = site.slice(0, -base.length - 1);
    return !sub || /^(www\d*|m|mobile|amp|[a-z]{2}(-[a-z]{2})?)$/.test(sub) ? base : site;
  }

  function addSiteAsSection(host) {
    const site = siteForHost(host);
    const name = promptText("New section", `Name for the section with tabs from ${site}:`, defaultName(site));
    if (name === null) {
      return;
    }
    const sections = getSections();
    sections.push({ kind: "site", name, sites: [site], color: null });
    setSections(sections);
  }

  function addSiteToCollection(host, index) {
    const sections = getSections();
    sections[index].sites.push(siteForHost(host));
    setSections(sections);
  }

  function removeSite(address) {
    const sections = getSections();
    const si = sectionIndexFor(address, sections);
    if (si < 0) {
      return;
    }
    const section = sections[si];
    // The most specific of its sites that the tab is on (the one that matched).
    const site = section.sites
      .filter(d => siteMatches(address, d))
      .reduce((a, b) => (b.length > a.length ? b : a));
    section.sites = section.sites.filter(d => d !== site);
    if (!section.sites.length && section.kind === "site") {
      sections.splice(si, 1);
    }
    setSections(sections);
  }

  /* ---------- menus ---------- */

  function menuItem(label, oncommand) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", label);
    item.addEventListener("command", oncommand);
    return item;
  }

  function setupMenus() {
    // Tab context menu: put the tab's website in a section, or take it out.
    let contextAddress = null;
    const tabMenu = document.getElementById("tabContextMenu");
    const sep = document.createXULElement("menuseparator");
    // Labels name the tab's site once the menu opens; these are for anything
    // that lists the items before that (like Zen Context Menu's settings).
    const ownItem = menuItem("Give this site its own section", () => contextAddress && addSiteAsSection(siteHost(contextAddress)));
    const collectionMenu = document.createXULElement("menu");
    collectionMenu.setAttribute("label", "Add this site to a collection");
    const collectionPopup = document.createXULElement("menupopup");
    collectionMenu.append(collectionPopup);
    const removeItem = menuItem("Remove this site from its section", () => contextAddress && removeSite(contextAddress));
    const settingsItem = menuItem("Tab Groups settings…", openSettings);
    const all = [sep, ownItem, collectionMenu, removeItem, settingsItem];
    // Ids let other mods (Zen Context Menu) recognize the items, whose labels
    // change with the tab's site.
    sep.id = "context_zsg-separator";
    ownItem.id = "context_zsg-own-section";
    collectionMenu.id = "context_zsg-add-to-collection";
    removeItem.id = "context_zsg-remove-site";
    settingsItem.id = "context_zsg-settings";
    tabMenu.append(...all);

    tabMenu.addEventListener("popupshowing", e => {
      if (e.target !== tabMenu) {
        return;
      }
      const tab = TabContextMenu.contextTab;
      // Switched off in the options: none of the items, settings included
      // (the header menu and Sine's gear button still open it).
      const showItems = Services.prefs.getBoolPref(PREF_TAB_MENU, true);
      const address = tab && !tab.pinned && modEnabled && showItems ? tabAddress(tab) : null;
      contextAddress = address;
      all.forEach(el => (el.hidden = !address));
      if (!address) {
        return;
      }
      const host = siteHost(address);
      const site = siteForHost(host);
      const sections = getSections();
      const si = sectionIndexFor(address, sections);
      ownItem.hidden = collectionMenu.hidden = si >= 0;
      removeItem.hidden = si < 0;
      if (si >= 0) {
        removeItem.setAttribute("label", `Remove from “${displayName(sections[si])}”`);
        return;
      }
      ownItem.setAttribute("label", `Give ${site} its own section`);
      collectionMenu.setAttribute("label", `Add ${site} to a collection`);
      collectionPopup.replaceChildren(
        ...sections
          .map((s, i) => [s, i])
          .filter(([s]) => s.kind === "collection")
          .map(([s, i]) => menuItem(displayName(s), () => addSiteToCollection(host, i)))
      );
      collectionMenu.hidden = !collectionPopup.children.length;
    });

    // Header context menu: reorder / rename / remove.
    const popup = document.createXULElement("menupopup");
    popup.id = "zsg-header-menu";
    const triggerHeader = () => popup.triggerNode?.closest(".zsg-header");
    const closeAllItem = menuItem("Close all tabs in this section", () => {
      const header = triggerHeader();
      if (header) {
        closeGroup(header, true);
      }
    });
    const unloadAllItem = menuItem("Unload all tabs in this section", () => {
      const header = triggerHeader();
      if (header) {
        unloadGroup(header);
      }
    });
    const edit = fn => () => {
      const header = triggerHeader();
      const label = header?.getAttribute("data-label");
      const sections = getSections();
      const i = sections.findIndex(s => displayName(s) === label);
      if (i >= 0 && fn(sections, i) !== false) {
        animated(header.parentElement, () => setSections(sections));
      }
    };
    // The space whose list the header is in.
    const headerSpace = () => triggerHeader()?.parentElement?.getAttribute("zen-workspace-id") ?? null;
    const spacesSep = document.createXULElement("menuseparator");
    const onlyHereItem = menuItem(
      "Only in this space",
      edit((s, i) => {
        const space = headerSpace();
        if (!space) {
          return false;
        }
        s[i].spaces = [space];
      })
    );
    const everywhereItem = menuItem(
      "Show in all spaces",
      edit((s, i) => {
        s[i].spaces = [];
      })
    );
    // A section made automatically (Auto-group other sites) isn't saved, so
    // its menu offers to keep it instead of editing it.
    const keepItem = menuItem("Keep as a section", () => {
      const header = triggerHeader();
      const site = header?.getAttribute("data-site");
      if (site) {
        // Keeps its name, so a folded section stays folded.
        const label = header.getAttribute("data-label");
        const name = label === defaultName(site) ? "" : label;
        const sections = getSections();
        sections.push({ kind: "site", name, sites: [site], color: null, spaces: [], minTabs: null });
        animated(header.parentElement, () => setSections(sections));
      }
    });
    const editItems = [];
    const moveItems = [];
    popup.addEventListener("popupshowing", e => {
      if (e.target !== popup) {
        return;
      }
      const header = triggerHeader();
      const auto = !!header?.hasAttribute("zsg-auto");
      closeAllItem.disabled = !!header?.hasAttribute("zsg-empty");
      unloadAllItem.disabled = !!header?.hasAttribute("zsg-none-loaded");
      const section = getSections().find(s => displayName(s) === header?.getAttribute("data-label"));
      const space = headerSpace();
      // With one space (or spaces off) there's nothing to choose.
      const several = getSpaces().length > 1;
      onlyHereItem.hidden = auto || !several || !space || (section?.spaces.length === 1 && section.spaces[0] === space);
      everywhereItem.hidden = auto || !section?.spaces.length;
      spacesSep.hidden = onlyHereItem.hidden && everywhereItem.hidden;
      editItems.forEach(item => (item.hidden = auto));
      keepItem.hidden = !auto;
      // A section that stays where its tabs are moves by dragging only.
      moveItems.forEach(item => (item.hidden ||= !!header?.hasAttribute("zsg-float")));
    });
    moveItems.push(
      menuItem("Move section up", edit((s, i) => i > 0 && ([s[i - 1], s[i]] = [s[i], s[i - 1]]))),
      menuItem("Move section down", edit((s, i) => i < s.length - 1 && ([s[i + 1], s[i]] = [s[i], s[i + 1]])))
    );
    editItems.push(
      ...moveItems,
      menuItem(
        "Rename…",
        edit((s, i) => {
          const old = displayName(s[i]);
          const name = promptText("Rename section", "New name:", old);
          if (!name) {
            return false;
          }
          s[i].name = name;
          const set = getCollapsed();
          if (set.delete(old)) {
            set.add(name);
            setCollapsed(set);
          }
          return true;
        })
      ),
      menuItem("Remove section", edit((s, i) => s.splice(i, 1)))
    );
    popup.append(
      keepItem,
      ...editItems,
      spacesSep,
      onlyHereItem,
      everywhereItem,
      document.createXULElement("menuseparator"),
      unloadAllItem,
      closeAllItem,
      document.createXULElement("menuseparator"),
      menuItem("Tab Groups settings…", openSettings)
    );
    document.getElementById("mainPopupSet").append(popup);
  }

  // The settings button on this mod's card (Settings > Zen Mods, or Sine
  // Mods) opens the full settings page instead of the basic options box.
  function hookModCard(browser) {
    let win;
    try {
      win = browser.contentWindow;
    } catch {
      return;
    }
    if (!win || win.__zsgHooked || !/^about:(preferences|settings)/.test(String(win.location?.href))) {
      return;
    }
    win.__zsgHooked = true;
    win.addEventListener(
      "click",
      e => {
        const zenButton = e.target.closest?.(".zenThemeMarketplaceItemConfigureButton");
        const sineButton = e.target.closest?.(".sineItemConfigureButton");
        const ours =
          zenButton
            ?.closest(".zenThemeMarketplaceItem")
            ?.querySelector(".zenThemeMarketplaceItemUninstallButton")
            ?.getAttribute("zen-mod-id") === MOD_ID ||
          sineButton?.closest(".sineItem")?.getAttribute("mod-id") === SINE_MOD_ID;
        if (ours) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openSettings();
        }
      },
      true
    );
  }

  /* ---------- wiring ---------- */

  function init() {
    migrateOldPrefs();
    windowUtils.loadSheetUsingURIString(
      "data:text/css;charset=utf-8," + encodeURIComponent(CSS),
      windowUtils.AUTHOR_SHEET
    );
    setupMenus();

    // Used by the settings page.
    window.ZenSiteGroups = { getSections, setSections, defaultSections, normalizeSite, defaultName, displayName, iconColor, getSpaces };
    for (const pref of OLD_ICON_COLOR_PREFS) {
      if (Services.prefs.prefHasUserValue(pref)) {
        Services.prefs.clearUserPref(pref);
      }
    }

    const tabContainer = gBrowser.tabContainer;
    // TabBrowserDiscarded / TabBrowserInserted: a tab unloaded or loaded
    // again, for the Unload button.
    for (const type of ["TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned", "TabSelect", "TabGrouped", "TabUngrouped", "TabBrowserDiscarded", "TabBrowserInserted"]) {
      tabContainer.addEventListener(type, schedule);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);

    // New tabs get an outline until they're selected (tabs opened in front
    // are selected right away) or the time runs out.
    const unmarkNew = tab => {
      if (tab.hasAttribute("zsg-new")) {
        tab.removeAttribute("zsg-new");
        schedule(); // its folded header, if any
      }
    };
    tabContainer.addEventListener("TabOpen", e => {
      const time = choice(PREF_NEW_TAB, "15", NEW_TAB_CHOICES);
      if (!modEnabled || time === "0") {
        return;
      }
      const tab = e.target;
      tab.setAttribute("zsg-new", "");
      if (time !== "click") {
        setTimeout(() => unmarkNew(tab), time * 1000);
      }
    });
    tabContainer.addEventListener("TabSelect", e => unmarkNew(e.target));
    tabContainer.addEventListener("TabAttrModified", e => {
      if (unsureSites.size && e.detail?.changed?.includes("image")) {
        retryUnsureColors();
      }
    });

    const { STATE_START, STATE_STOP, STATE_IS_DOCUMENT } = Ci.nsIWebProgressListener;
    gBrowser.addTabsProgressListener({
      onStateChange(browser, webProgress, request, flags) {
        if (!webProgress?.isTopLevel || !(flags & STATE_IS_DOCUMENT)) {
          return;
        }
        if (flags & STATE_START) {
          let spec = null;
          try {
            spec = request.QueryInterface(Ci.nsIChannel).URI.spec;
          } catch {
            spec = request?.name ?? null;
          }
          if (spec && /^https?:/i.test(spec)) {
            pendingURL.set(browser, spec);
            schedule();
          }
        } else if (flags & STATE_STOP) {
          pendingURL.delete(browser);
          hookModCard(browser);
        }
      },
      onLocationChange(browser, webProgress) {
        if (webProgress?.isTopLevel) {
          pendingURL.delete(browser);
          schedule();
          hookModCard(browser);
        }
      },
    });

    // Any zen.sitegroups.* change (settings page, menus, collapsing, colors).
    const prefObserver = { observe: schedule };
    // Zen flips this pref whenever a mod is switched on/off in Settings.
    const modsObserver = { observe: () => refreshModEnabled().then(schedule) };
    const modPrefs = ["zen.mods.updated-value-observer", "zen.themes.disable-all"];
    Services.prefs.addObserver(PREF_BRANCH, prefObserver);
    modPrefs.forEach(p => Services.prefs.addObserver(p, modsObserver));
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(PREF_BRANCH, prefObserver);
      modPrefs.forEach(p => Services.prefs.removeObserver(p, modsObserver));
    });

    // Settings may already be open (e.g. restored from the last session).
    gBrowser.browsers.forEach(hookModCard);

    refreshModEnabled().then(schedule);
  }

  function whenReady(fn) {
    // Some windows (e.g. with spaces disabled) may never report "initialized".
    const go = () =>
      Promise.race([
        window.gZenWorkspaces?.promiseInitialized ?? Promise.resolve(),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ]).then(fn);
    if (gBrowserInit.delayedStartupFinished) {
      go();
      return;
    }
    const obs = subject => {
      if (subject === window) {
        Services.obs.removeObserver(obs, "browser-delayed-startup-finished");
        go();
      }
    };
    Services.obs.addObserver(obs, "browser-delayed-startup-finished");
  }

  whenReady(init);
})();
