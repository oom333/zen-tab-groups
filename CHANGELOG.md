# Changelog

Notable changes to Tab Groups. Versions match `version` in `theme.json`;
bump `updatedAt` along with it (to the current UTC time), as that's what
tells Sine an update is available.

## [Unreleased]

## [1.5.0]

Brings in the 1.1.0–1.4.0 work from
[oom333/zen-tab-groups#4](https://github.com/oom333/zen-tab-groups/pull/4)
(thanks [@sinazadeh](https://github.com/sinazadeh)). Checked on Windows
with Zen 1.23.3b through Sine.

### Added

- **More ideas**: a fold-out under the collection ideas with Shopping,
  News, Work, Coding, Music, Gaming and Banking, each with bundled icons.

### Fixed

- The settings page now updates when an option is changed from Sine's
  options box while it's open.

## [1.4.0] - 2026-10-17

### Added

- Each section can set its own **Group from**: how many of its tabs must
  be open before they're grouped, say 3 for YouTube while the others use
  the default. It's on the settings page, under the section's websites,
  and kept in backups.

### Changed

- **Group from** goes up to 10 tabs (was 5), on the settings page as a
  dropdown.

## [1.3.0] - 2026-10-17

Checked against Zen 1.23.3b.

### Added

- More ways to style sections
  ([oom333/zen-tab-groups#2](https://github.com/oom333/zen-tab-groups/issues/2)),
  on the settings page (now in **Appearance** and **Behavior** cards) and
  in Sine's options:
  - **Indent tabs:** a section's tabs are indented like a folder's.
  - **Line along tabs:** a line in the section's color down the side of
    its tabs.
  - **Background:** a light shade of the section's color behind its
    header, its tabs, or both.
  - **Line in headers** can be switched off.
  - **Tab count:** when folded (as before), always, or never; and the
    **Collapse arrow** can be hidden (clicking the header still folds it).
- **Group from:** a section only forms once that many of its tabs (1 to 5) are open in a space; with fewer, they stay where they are.
- Sections can be kept to some spaces: pick them with the new spaces button
  on the settings page, or right-click a header → **Only in this space**
  (and **Show in all spaces**). In other spaces their tabs aren't grouped.
- **Header button:** **Clear** (closes the tabs, as before), **Unload**
  (keeps them and unloads their pages, like a folder's button) or **None**.
  Headers' right-click menu also gets **Unload all tabs in this section**.

### Fixed

- A tab that's pinned, or moved into a folder or a split view, no longer
  keeps its section's marks: one from a folded section stayed hidden.

## [1.2.0] - 2026-10-17

### Added

- **Items in the tab menu** (`zen.sitegroups.tab-menu-items`, on by
  default), on the settings page and in Sine's options. Switched off, none
  of Tab Groups' items show when you right-click a tab, settings included;
  the header menu and Sine's settings button still open the settings page.

### Changed

- Tab Groups' items in the tab menu have ids (`context_zsg-*`), so other
  mods can recognize them: Zen Calmer Context Menu lists and hides them by
  id, since their labels change with the tab's site. They also have generic
  labels until the menu first opens, for anything that lists them before
  that.

## [1.1.0] - 2026-10-15

### Added

- **Backups.** The settings page gets a Backup card: **Save backup…**
  writes the sections and options to a `.json` file through Zen's save
  dialog, and **Restore from backup…** loads one back after asking,
  replacing the current sections and options. Files that aren't Tab Groups
  backups, and option values the page can't show, are ignored. Opened
  outside Zen, the page uses a normal download and file picker instead.
- A **Banking** collection idea: 100 US banks, card issuers, money apps and
  credit unions, each with its icon.

### Changed

- Idea cards show their first 6 sites, with "+N more" to see the rest, and
  collections with more than 12 sites fold to 10 chips plus "+N more".
- If a collection with an idea's name already exists, the idea offers to
  add only the sites it's missing instead of showing "Added".

## [1.0.3] - 2026-10-14

### Changed

- Marked as Zen-only (tested on Zen 1.23.2b) and AI-assisted, in the
  README and in `theme.json`, which Sine reads.

## [1.0.2] - 2026-10-14

### Fixed

- Sine now offers updates. It compares `updatedAt`, not the version, and
  1.0.1 kept 1.0.0's date, so copies of 1.0.0 were never offered it;
  `updatedAt` is now a full timestamp.

## [1.0.1] - 2026-10-13

### Changed

- The settings button on Tab Groups' card in Sine Mods opens the full
  settings page (sections, colors, collections, options) instead of Sine's
  options box, which only fits simple checkboxes and dropdowns.

## [1.0.0] - 2026-10-13

First release: tabs from the sites you choose move to the top of Zen's
sidebar, under colored, collapsible headers, with a settings page and Sine
support.
