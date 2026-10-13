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
  // "-v2": colors picked by the newer method; the old cache is dropped.
  const PREF_ICON_COLORS = "zen.sitegroups.icon-colors-v2";
  const PREF_OLD_ICON_COLORS = "zen.sitegroups.icon-colors";
  const PREF_REST_DIVIDER = "zen.sitegroups.rest-divider";
  const PREF_KEEP_EMPTY = "zen.sitegroups.keep-empty-headers";
  const PREF_COLORED = "zen.sitegroups.colored-headers";
  const PREF_CHEVRON = "zen.sitegroups.chevron-position"; // "right" | "left"

  // A section is either one website ("site") or several under a name you
  // pick ("collection"). A website can only belong to one section.
  // Sites that tend to pile up dozens of tabs.
  const DEFAULT_SECTIONS = [
    { kind: "site", name: "YouTube", sites: ["youtube.com"], color: null },
    { kind: "site", name: "Reddit", sites: ["reddit.com"], color: null },
    { kind: "site", name: "Wikipedia", sites: ["wikipedia.org"], color: null },
    { kind: "site", name: "X", sites: ["x.com", "twitter.com"], color: null },
  ];
  const defaultSections = () => DEFAULT_SECTIONS.map(s => ({ ...s, sites: [...s.sites] }));
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
    .zsg-chevron {
      display: none;
      width: 16px;
      height: 16px;
      padding: 1px;
      list-style-image: url("chrome://browser/skin/zen-icons/arrow-right.svg");
      -moz-context-properties: fill, fill-opacity;
      fill: currentColor;
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
      .zsg-label { color: var(--zsg-color); opacity: 1; }
      .zsg-line { background: color-mix(in srgb, var(--zsg-color) 55%, transparent); }
    }
    .zsg-header[zsg-empty] { opacity: 0.55; }
    .zsg-clear {
      display: none;
      margin: 0;
      font-weight: 500;
      opacity: 0.6;
    }
    .zsg-clear:hover { opacity: 1; }
    .zsg-header:not([zsg-empty]):hover .zsg-clear { display: flex; }
    .zsg-rest { min-height: 12px; }

    :root:not([zen-sidebar-expanded="true"]) {
      .zsg-chevron, .zsg-label, .zsg-count, .zsg-clear { display: none !important; }
      .zsg-header { min-height: 12px; }
    }

    tab[zsg-collapsed]:not([selected], [multiselected]) { display: none !important; }
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

  function normalizeSite(text) {
    return String(text ?? "")
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/^www\./, "");
  }

  function defaultName(site) {
    let base = site;
    try {
      base = Services.eTLD.getBaseDomainFromHost(site);
    } catch {}
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
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
      }))
      .filter(s => s.sites.length || s.kind === "collection");
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
  const cachedIconColor = site => readJSON(PREF_ICON_COLORS, {})[site];

  const colorJobs = new Map();
  function iconColor(site) {
    const cached = cachedIconColor(site);
    if (cached !== undefined) {
      return Promise.resolve(cached || null);
    }
    if (!colorJobs.has(site)) {
      const job = (async () => {
        let color = null;
        let loadedAny = false;
        for (const src of iconCandidates(site)) {
          const img = await loadImage(src);
          if (!img) {
            continue;
          }
          loadedAny = true;
          try {
            color = dominantColor(img);
          } catch {}
          break;
        }
        if (loadedAny) {
          writeJSON(PREF_ICON_COLORS, { ...readJSON(PREF_ICON_COLORS, {}), [site]: color ?? "" });
        }
        colorJobs.delete(site);
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

  function tabHost(tab) {
    try {
      return tabURI(tab)?.host?.toLowerCase() || null;
    } catch {
      return null; // about:, file:, etc.
    }
  }

  // Index of the section whose website matches most specifically, or -1.
  function sectionIndexForHost(host, sections) {
    if (!host) {
      return -1;
    }
    let best = -1;
    let bestLen = 0;
    sections.forEach((section, i) => {
      for (const d of section.sites) {
        if ((host === d || host.endsWith("." + d)) && d.length > bestLen) {
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
    const clear = document.createXULElement("label");
    clear.className = "zsg-clear";
    clear.setAttribute("value", "Clear");
    clear.setAttribute("tooltiptext", "Close all tabs in this section");
    header.append(chevron, text, count, line, clear);

    // Keep clicks away from the tab strip (double-click there opens a new tab).
    for (const type of ["mousedown", "dblclick", "auxclick"]) {
      header.addEventListener(type, e => e.stopPropagation());
    }
    header.addEventListener("click", e => {
      e.stopPropagation();
      if (e.button !== 0 || header.hasAttribute("zsg-empty")) {
        return;
      }
      if (e.target.classList.contains("zsg-clear")) {
        closeGroup(header);
      } else {
        toggleCollapsed(header.getAttribute("data-label"));
      }
    });
    return header;
  }

  function makeRestDivider() {
    const rest = document.createXULElement("hbox");
    rest.className = "zsg-rest";
    const line = document.createXULElement("hbox");
    line.className = "zsg-line";
    rest.append(line);
    return rest;
  }

  function updateHeader(header, section, tabCount, opts) {
    const label = displayName(section);
    header.querySelector(".zsg-label").setAttribute("value", label);
    header.querySelector(".zsg-count").setAttribute("value", String(tabCount));
    header.toggleAttribute("zsg-closed", tabCount > 0 && opts.collapsed.has(label));
    header.toggleAttribute("zsg-empty", !tabCount);
    header.toggleAttribute("zsg-chevron-right", opts.chevronRight);
    const color = opts.colored ? sectionColor(section) : null;
    header.toggleAttribute("zsg-colored", !!color);
    if (color) {
      header.style.setProperty("--zsg-color", color);
    } else {
      header.style.removeProperty("--zsg-color");
    }
  }

  function layoutSection(container, sections, opts) {
    const content = [...container.children].filter(isContent);
    const grouped = [];
    for (const el of content) {
      if (el.localName !== "tab") {
        continue;
      }
      const si = sectionIndexForHost(tabHost(el), sections);
      if (si >= 0) {
        const label = displayName(sections[si]);
        grouped.push({ tab: el, si });
        el.setAttribute("zsg-group", label);
        el.toggleAttribute("zsg-collapsed", opts.collapsed.has(label));
      } else {
        el.removeAttribute("zsg-group");
        el.removeAttribute("zsg-collapsed");
      }
    }
    grouped.sort((a, b) => a.si - b.si); // stable: keeps order within a section

    // 1. Move grouped tabs to the top, in section order.
    let prevTab = null;
    for (const { tab } of grouped) {
      try {
        if (!prevTab) {
          const first = [...container.children].find(isContent);
          if (first && first !== tab) {
            gBrowser.moveTabBefore(tab, first);
          }
        } else if (nextContent(prevTab) !== tab) {
          gBrowser.moveTabAfter(tab, prevTab);
        }
      } catch (ex) {
        console.error("[Zen Tab Groups] move failed", ex);
      }
      prevTab = tab;
    }

    // 2. A header above each section (also empty ones, if enabled).
    const existing = new Map();
    for (const el of container.children) {
      if (el.classList.contains("zsg-header")) {
        existing.set(el.getAttribute("data-label"), el);
      }
    }
    const keep = new Set();
    let last = null; // last element of the sections area so far
    sections.forEach((section, si) => {
      const tabs = grouped.filter(g => g.si === si).map(g => g.tab);
      if (!tabs.length && !opts.keepEmpty) {
        return;
      }
      const label = displayName(section);
      if (keep.has(existing.get(label))) {
        return; // two sections with the same name: the first one wins
      }
      const header = existing.get(label) ?? makeHeader(label);
      updateHeader(header, section, tabs.length, opts);

      if (tabs.length) {
        if (header.nextElementSibling !== tabs[0]) {
          container.insertBefore(header, tabs[0]);
        }
        last = tabs.at(-1);
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

    // 3. A plain line between the sections and everything else.
    if (last && opts.restDivider) {
      const firstOther = nextContent(last);
      if (firstOther) {
        let rest = [...container.children].find(el => el.classList.contains("zsg-rest"));
        rest ??= makeRestDivider();
        if (rest.nextElementSibling !== firstOther) {
          container.insertBefore(rest, firstOther);
        }
        keep.add(rest);
      }
    }

    for (const el of [...container.children]) {
      if (isOurs(el) && !keep.has(el)) {
        el.remove();
      }
    }
  }

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
    // Don't fight the user mid-drag.
    if (gBrowser.tabContainer.hasAttribute("movingtab")) {
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
        chevronRight: Services.prefs.getStringPref(PREF_CHEVRON, "right") !== "left",
      };
      for (const container of document.querySelectorAll(".zen-workspace-normal-tabs-section")) {
        layoutSection(container, sections, opts);
      }
    } catch (ex) {
      console.error("[Zen Tab Groups]", ex);
    }
  }

  /* ---------- actions ---------- */

  function toggleCollapsed(label) {
    const set = getCollapsed();
    set.has(label) ? set.delete(label) : set.add(label);
    setCollapsed(set); // pref observer re-runs layout
  }

  function closeGroup(header) {
    const label = header.getAttribute("data-label");
    const tabs = [...header.parentElement.children].filter(
      el => el.localName === "tab" && el.getAttribute("zsg-group") === label
    );
    gBrowser.removeTabs(tabs);
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

  function removeSite(host) {
    const sections = getSections();
    const si = sectionIndexForHost(host, sections);
    if (si < 0) {
      return;
    }
    const section = sections[si];
    const site = section.sites.find(d => host === d || host.endsWith("." + d));
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
    let contextHost = null;
    const tabMenu = document.getElementById("tabContextMenu");
    const sep = document.createXULElement("menuseparator");
    const ownItem = menuItem("", () => contextHost && addSiteAsSection(contextHost));
    const collectionMenu = document.createXULElement("menu");
    const collectionPopup = document.createXULElement("menupopup");
    collectionMenu.append(collectionPopup);
    const removeItem = menuItem("", () => contextHost && removeSite(contextHost));
    const settingsItem = menuItem("Tab Groups settings…", openSettings);
    const all = [sep, ownItem, collectionMenu, removeItem, settingsItem];
    tabMenu.append(...all);

    tabMenu.addEventListener("popupshowing", e => {
      if (e.target !== tabMenu) {
        return;
      }
      const tab = TabContextMenu.contextTab;
      const host = tab && !tab.pinned && modEnabled ? tabHost(tab) : null;
      contextHost = host;
      all.forEach(el => (el.hidden = !host));
      if (!host) {
        return;
      }
      const site = siteForHost(host);
      const sections = getSections();
      const si = sectionIndexForHost(host, sections);
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
    const closeAllItem = menuItem("Close all tabs in this section", () => {
      const header = popup.triggerNode?.closest(".zsg-header");
      if (header) {
        closeGroup(header);
      }
    });
    popup.addEventListener("popupshowing", () => {
      closeAllItem.disabled = !!popup.triggerNode?.closest(".zsg-header")?.hasAttribute("zsg-empty");
    });
    const edit = fn => () => {
      const label = popup.triggerNode?.closest(".zsg-header")?.getAttribute("data-label");
      const sections = getSections();
      const i = sections.findIndex(s => displayName(s) === label);
      if (i >= 0 && fn(sections, i) !== false) {
        setSections(sections);
      }
    };
    popup.append(
      menuItem("Move section up", edit((s, i) => i > 0 && ([s[i - 1], s[i]] = [s[i], s[i - 1]]))),
      menuItem("Move section down", edit((s, i) => i < s.length - 1 && ([s[i + 1], s[i]] = [s[i], s[i + 1]]))),
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
      menuItem("Remove section", edit((s, i) => s.splice(i, 1))),
      document.createXULElement("menuseparator"),
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
    window.ZenSiteGroups = { getSections, setSections, defaultSections, normalizeSite, defaultName, displayName, iconColor };
    if (Services.prefs.prefHasUserValue(PREF_OLD_ICON_COLORS)) {
      Services.prefs.clearUserPref(PREF_OLD_ICON_COLORS);
    }

    const tabContainer = gBrowser.tabContainer;
    for (const type of ["TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned", "TabSelect", "TabGrouped", "TabUngrouped"]) {
      tabContainer.addEventListener(type, schedule);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);

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
