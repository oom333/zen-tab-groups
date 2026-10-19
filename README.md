# Tab Groups for Zen

Keeps your busiest sites at the top of Zen's sidebar. Tabs from YouTube, Reddit or any site you pick jump into their own section the moment you open them, under a colored header you can collapse.

> **Zen Browser only** (tested on 1.23.2b). It relies on Zen's sidebar and workspaces, so it won't work in Firefox or other Firefox-based browsers.

![Tab Groups](previews/thumb@2x.png)

## Features

- **Sorted automatically.** New tabs go straight into their section, in the order you choose. No dragging.
- **Colored headers.** Each header takes the main color of the site's logo, a color you pick, or one color for every section.
- **Collections.** Put several sites under one name, like ChatGPT, Claude and Gemini as "AI".
- **Fold away.** Hover a header to show the collapse arrow. Click it to hide the section's tabs, or click **Clear** to close them all (or **Unload** to free their memory).
- **Your look.** Indent a section's tabs, draw a line along them, tint the header, the tabs or the whole section as one block (light, medium or strong), hide the header line, arrow or tab count. Text stays readable on any color.
- **Per space.** Keep a section to the spaces you choose, and group a site only once enough of its tabs are open.
- **Settings page** with a live preview, drag-to-reorder and ready-made collection ideas: Browser, Social and Watch, plus **More ideas** with AI, Shopping, News, Work, Coding, Music, Gaming and Banking (100 US banks, card issuers, money apps and credit unions).
- **Backups.** Save your sections and options to a file, and restore them later or on another computer.

![Before and after](previews/before-after.png)

## Install

### With Sine (recommended)

[Sine](https://github.com/CosmoCreeper/Sine) is a mod manager for Zen that can run script mods like this one.

1. Install Sine if you don't have it yet.
2. In Zen, open **Settings → Sine Mods**.
3. This mod runs JavaScript, so until it's listed in Sine's store, turn on installing JS from unofficial sources in Sine's settings.
4. Install it from GitHub by entering `oom333/zen-tab-groups`.
5. Restart Zen.

### Manually (fx-autoconfig)

1. Set up [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) in Zen.
2. Copy `tab-groups.uc.js` **and** the `tab-groups` folder into your profile's `chrome/JS/` folder. Find your profile folder in `about:support` → **Profile Folder**.
3. In `about:support`, click **Clear startup cache…**, then restart Zen.

## Using it

Out of the box you get sections for **YouTube, Reddit, Wikipedia and X**.

- **Right-click a tab** → *Give this site its own section*, or add it to a collection.
- **Right-click a header** → move it up or down, rename it, remove it, keep it to the current space (or show it in all spaces again), unload or close all its tabs, or open the settings.
- **Settings page:** right-click any header or tab → **Tab Groups settings…**, or click the settings button of Tab Groups in Sine.

![Settings page](previews/settings.png)

### Website vs. collection

- **Website:** one site with its own section, like YouTube. It's named and colored from the site's icon automatically.
- **Collection:** several sites under a name and color you choose.

A website can only be in one section. The most specific address wins, so `music.youtube.com` can have its own section next to `youtube.com`.

### Spaces

A section is used in every space unless you pick some: with more than one space, each section on the settings page has a button listing the spaces it's used in, or right-click its header → **Only in this space**. In the other spaces its tabs aren't grouped.

### Options

Available on the settings page, and in Sine's settings for the mod:

Appearance:

- **Colored headers:** on by default.
- **Colors:** each section's own color (from its icon, or one you pick), or one color for all sections.
- **Background:** a shade of the section's color behind its header, its tabs, both, or the whole section as one block.
- **Background strength:** light (default), medium or strong.
- **Keep text readable:** on by default. Text turns lighter or darker when it would be hard to read on a color.
- **Indent tabs:** shifts each section's tabs to the right, like the tabs in a folder.
- **Line along tabs:** a line in the section's color down the side of its tabs.
- **Line in headers:** the line from a section's name to the edge of the sidebar; on by default.
- **Collapse arrow:** right of the name (default), left of it, or hidden. Clicking a header folds its tabs either way.
- **Tab count:** next to the name when a section is folded (default), always, or never.
- **Divider below sections:** a thin line between your sections and your other tabs.
- **Zen's Clear button:** at the top as usual (default), on the divider below your sections, or both. On the divider it closes only the tabs below it, the ones not in a section. It still shows when the divider line is off.

Behavior:

- **Group from:** how many of a section's tabs must be open in a space before they're grouped (1 by default, up to 10). With fewer, they stay where they are. Each section can set its own number on the settings page (**Group from** under its websites), say 3 for YouTube and the default for the rest.
- **Header button:** what the button that appears when you hover a header does: **Clear** closes the section's tabs (default), **Unload** keeps them but unloads their pages, like a folder's button, or **None**.
- **Always show headers:** keeps a section's header even when none of its tabs are open.
- **Items in the tab menu:** on by default. Switch it off to keep Tab Groups' items out of the tab right-click menu; right-click a header to open the settings instead.

### Backup

On the settings page, **Save backup…** writes your sections and options to a `.json` file. **Restore from backup…** loads one back, replacing your current sections and options.

### Collection ideas

Add a ready-made collection with one click. If you already have a collection with the same name (say, your own "Banking"), the idea offers to add just the sites you're missing instead.

## Notes

- To pick header colors, the mod looks at each site's icon. It uses icons Zen already has saved, and otherwise loads `https://<site>/favicon.ico` once. The colors are saved, so this only happens the first time.
- Settings are stored as `zen.sitegroups.*` prefs in `about:config`.

## License

[MIT](LICENSE)
