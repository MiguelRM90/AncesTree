<!-- Written in English: this is the one document that ships with the code. The
     working specification lives alongside it in Spanish and stays local. -->

# AncesTree

A family tree that lives on your own computer.

Build and keep a family's genealogical archive in the browser. No accounts, no
subscription, no backend: **the data never leaves your machine**. When you want
to share it with a relative, you hand them a folder or a ZIP.

> **Status: in development.** It works end to end, but the data format is still
> being designed and can change between builds.

---

## How it works

    Code         public   (this repository)
    Data         private  (your disk)
    Application  a static web page
    Backend      none

The application is a few hundred kilobytes served from GitHub Pages and
installable as a PWA, so it runs offline afterwards. Your archive is an ordinary
folder you can see, back up and compress with the tools you already use.

```
FamilyName/
├─ family.json     the tree
├─ family.ged      GEDCOM, for other genealogy software
├─ manifest.json   metadata
├─ photos/
├─ documents/
└─ backups/        rotated automatically before every save
```

Zipping that folder produces a file another relative can open and carry on with.

---

## What it does

- **Privacy by construction.** There is no server to send anything to. The code
  is public and auditable.
- **No practical limit on photographs.** Binaries go to your disk, not to a
  browser storage quota.
- **Dates as they really are**: *about 1885*, *May 1912*, *before 1900*,
  *between 1900 and 1905* — with validation that understands uncertainty
  instead of demanding precision nobody has.
- **Two surnames**, kept separate, as Spanish records write them. It is what
  makes a line traceable.
- **Honest genealogy**: adoptions and guardianships distinguished from the
  biological line, unknown parents, unions between relatives. The application
  warns; it does not refuse.
- **Interoperable**: GEDCOM 5.5.1 in and out, with the full cycle verified over
  a 10,000-person archive.
- **Accessible**: keyboard navigation, screen reader support, and a colour
  palette checked against WCAG AA by the test suite.
- **English and Spanish** interface.
- **Zero runtime dependencies.** Plain HTML, CSS and JavaScript — including the
  ZIP reader and writer, the GEDCOM parser and the tree layout engine.

---

## Requirements

**Chrome, Edge, Opera, Brave or Vivaldi, on a desktop computer.**

The app uses the File System Access API to work directly on a folder of your
disk with no size limit. That API does not exist in Firefox, in Safari, or in
any mobile browser, so there the app shows a requirements screen instead of
starting.

That is deliberate. Storing somebody's family archive in a place the browser
may clear to reclaim space is not acceptable, and a half-working fallback would
be worse than an honest refusal.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173/AncesTree/
npm test         # 211 tests, in a real browser
npm run lint
npm run build    # dist/, ready for GitHub Pages
```

The `/AncesTree/` in the URL is not optional: the build is configured for a
project page of that name.

### Trying it at scale

```bash
npm run stress:generate   # a synthetic 10,000-person archive
npm run stress:bench      # timings against the performance budget
```

The generator builds a structurally realistic tree — ten generations, fuzzy
dates, adoptions, unknown parents, marriages between cousins — so the numbers
mean something. Open the folder it writes with **Open a folder**.

---

## Layout

```
src/
├─ domain/     pure functions: model, dates, graph, validation, layout, GEDCOM
├─ storage/    disk and IndexedDB
├─ store/      state, mutations, events
└─ ui/         Web Components
```

Dependencies only ever point downwards: `ui → store → domain → storage`, and
`domain/` imports no DOM at all, which is what lets most of the code be tested
without a browser. ESLint enforces it.

---

## Licence

MIT. See [LICENSE](LICENSE).
