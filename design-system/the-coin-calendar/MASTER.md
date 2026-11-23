# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/the-coin-calendar/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** The Coin Calendar (www.thecoincalendar.com)
**Recorded:** 2026-11-22, from the live stylesheet `assets/style.css` and the built pages. This records the site as it is. It is not a redesign.
**Stack:** Static HTML/CSS/JS built by `build.js`, hosted on GitHub Pages.
**Category:** Event directory / calendar (U.S. coin shows), many visitors 55+.
**Token files:** `tokens.json` (W3C Design Tokens JSON) and `tokens.css` (`:root` variables). The live source of truth is the `:root` block at the top of `assets/style.css`. The token files mirror it.

### House rules (always)

- Never show the owner's name or dealership anywhere on the site.
- No organizer login accounts. No dealer want-lists.
- Color meaning: **banknote green = anything you click**, **proof gold = National shows, featured, sponsor**, **ink text on currency paper**.
- Fonts: Literata for headings, Source Sans 3 for everything else (plain zero, no slash). No third font.
- Review every page as a visitor on a phone (390px) and a computer (1280px) before shipping.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Ink (text, top bar, footer) | `#14231D` | `--ink` |
| Paper (page background) | `#F7F5EF` | `--paper` |
| Card | `#FFFFFF` | `--card` |
| Muted text | `#55635C` | `--muted` |
| Line (card borders) | `#DCE0D8` | `--line` |
| Line soft | `#ECEFE8` | `--line-soft` |
| Line mid (pager, local tag) | `#C9CFC6` | `--line-mid` |
| Line strong (input borders) | `#98A39C` | `--line-strong` |
| Soft fill | `#EEF1EA` | `--soft` |
| Zebra row | `#FAFAF6` | `--zebra` |
| Mint (hero) | `#E9EFE7` | `--mint` |
| **Primary green** (links, buttons) | `#1C5B45` | `--wine` |
| Primary green, hover | `#134A37` | `--wine-dark` |
| Green tint | `#E3EEE8` | `--wine-tint` |
| **Gold** (National, featured) | `#B8933F` | `--brass` |
| Gold text | `#7A5C1C` | `--brass-dark` |
| Gold tint (callouts, National rows) | `#FBF3E0` | `--brass-tint` |
| Cream (hover on gold/light buttons) | `#E8D9A8` | `--cream` |
| Soft text on ink | `#C9D2CD` | `--on-ink-soft` |
| Success | `#1C5B45` | `--ok` |
| Error | `#A3361B` | `--err` |

Show tiers in lists: **National** row = `--brass-tint` with a `--brass` border and a gold NATIONAL tag. **Regional** row = `#EDF4EF` with a `--wine` border and a solid green REGIONAL tag (white text). **Local** = plain white.

Note: `--wine` is the historical name of the primary green. Keep the name; do not rename.

### Typography

- **Heading font:** Literata 600/700 (`--serif`), fallback Georgia, serif
- **Body font:** Source Sans 3 400/600/700 (`--sans`), fallback system-ui
- **Google Fonts:** `https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,600;7..72,700&family=Source+Sans+3:wght@400;600;700&display=swap`

| Use | Size | Weight | Font |
|-----|------|--------|------|
| Page title (h1) | 32px phone, 40px computer (hero 50px) | 700 | Literata |
| Section heading (h2) | 26px | 700 | Literata |
| Card / sidebar heading (h2) | 20–22px | 700 | Literata |
| Body | 18px, line-height 1.55 | 400 | Source Sans 3 |
| Secondary text (city, venue) | 15–17px, `--muted` | 400 | Source Sans 3 |
| Form labels | 15–16px | 700 | Source Sans 3 |
| Buttons | 18px (small 16px) | 600 | Source Sans 3 |
| Tags | 12px uppercase, letter-spacing .06em | 600 | Source Sans 3 |
| Eyebrow labels ("NEXT SHOW", "NEXT DATES") | 12–14px uppercase | 700 | Source Sans 3 |

All headings use `text-wrap: balance`.

### Spacing

No formal scale is coded. In practice the site uses **4, 8, 12, 16, 20, 24, 28px**, with 6/10/14px for tight UI inside cards.

| Thing | Value |
|-------|-------|
| Page container | max-width 1228px, side padding 24px (16px on phones) |
| Card padding | 16–22px (big panels 20–26px) |
| Gap between list cards (phone) | 10–12px |
| Section gap | 28–36px |

### Corner radius

| Value | Used for |
|-------|----------|
| 4px | Tags |
| 6px | Small inner items (menu rows, photo thumbnails, chip list items) |
| 8px | Buttons, inputs, selects, pager buttons, date tiles, state tiles |
| 10px | Cards, callout boxes, show rows on phones, popups |
| 14px | Big panels (homepage hero, All shows filter box, List-your-show doors) |
| 999px | Pill chips, "↑ Top" button |
| 50% | Round arrow buttons |

### Shadow Depths

The site is flat. Cards use a border, not a shadow.

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-hover` | `0 4px 14px rgba(20,35,29,.12)` | Hover lift on Major show cards |
| `--shadow-pop` | `0 12px 30px rgba(20,35,29,.18)` | Dropdowns: By state menu, calendar menus |
| `--shadow-float` | `0 4px 14px rgba(20,35,29,.3)` | Floating "↑ Top" button |

### Breakpoints and layers

- Phone layout: `max-width: 760px`. The menu folds into the Menu button at `max-width: 1040px`.
- Layers: dropdown/popup 15–30, sticky top bar 40, "↑ Top" button 45.
- Top bar is sticky. `html{scroll-padding-top:84px}` keeps anchored and focused items clear of it.

---

## Component Specs

### Buttons (`.btn` + one color class)

```css
.btn { min-height: 52px; padding: 0 20px; border-radius: 8px; border: 1.5px solid transparent;
       font: 600 18px var(--sans); }
.btn-primary { background: var(--wine); color: #fff; }            /* main action */
.btn-primary:hover { background: var(--wine-dark); }
.btn-ghost { background: var(--card); color: var(--wine); border-color: var(--wine); }  /* second action */
.btn-ghost:hover { background: var(--wine-tint); }
.btn-gold { background: var(--brass); color: var(--ink); }        /* organizer/claim actions, and on the dark show header */
.btn-gold:hover { background: var(--cream); }
.btn-light { background: #fff; color: var(--ink); }               /* on dark backgrounds */
.btn-outline-light { background: transparent; color: #fff; border-color: #fff; }  /* on dark backgrounds */
```

Sizes: `.btn-sm` 44px / 16px. ZIP search button 58px / 19px. Form submit `.btn-big` 58px / 20px, full width.
One primary (filled) button per area; other actions use `.btn-ghost`.

### Filter chips (`.fchip`)

Pill, 44px tall, 16px bold, white with a `--line` border. Selected = ink background, white text.
Exception: inside the All shows filter box, chips have a gold-tinted border (`#D9C48E`) and selected = green (see `pages/all-shows.md`).

### Pager

48×48px buttons, radius 8px, `--line-mid` border. Current page = ink. Next = green filled, Previous = green outline. Pattern: `1 2 3 4 5 … last`.

### Cards

```css
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 22px; }
/* Callout (claim box, organizer box, ended notice) */
.callout-gold { background: var(--brass-tint); border: 1–1.5px solid var(--brass); border-radius: 10px; }
```

No shadows on cards. Hover on clickable cards: border turns `--brass` and `--shadow-hover`.

### Show list rows

Computer: a table with a dark ink header row, zebra rows, date / state / name columns.
Phone: each row is a 10px-radius card with a date tile on the left (8px radius, month in caps, day number large, weekday small). The whole card is tappable.

### Tags

12px uppercase, radius 4px, padding 2px 8px.
NATIONAL = gold on ink text. REGIONAL = green with white text. FREE = `#E7F0E9` with green text. DEALER LIST = `--wine-tint` with green text. Local shows get no tag.

### Inputs

```css
input, select { min-height: 52px; padding: 10px 12px; border: 1.5px solid var(--line-strong);
                border-radius: 8px; font-size: 18px; background: var(--card); }
```

Labels sit above the field (15–16px bold). Helper text sits under the field in `--muted`.

### Focus

`:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px; }` everywhere. Never remove it.

### Icons

Inline SVG for logo, map pin and verified tick. Simple text arrows (→ ↗ ↓ ▾ ✓) are used beside words. No emoji.

---

## Style Guidelines

**Style:** flat, print-inspired "currency paper": cream page, white cards with thin borders, dark ink bars, gold reserved for the biggest shows.

**Key Effects:** almost no motion. The coin and guilloche patterns are decorative and stop when the visitor asks for reduced motion.

### Page Pattern

Top bar (logo, All shows, This weekend, Major shows, Dealers, By state, gold "List your show") → breadcrumb → serif page title + one-line intro → main content → dark footer (Find shows / Dealers & selling / The Coin Calendar).

---

## Anti-Patterns (Do NOT Use)

- ❌ A third font, or a font with a slashed zero
- ❌ Gold buttons for ordinary actions (gold means big shows, featured or organizer actions)
- ❌ Shadows on cards, or pure black shadows
- ❌ Raw hex colors in new rules when a token exists
- ❌ Text under 12px; tap targets under 44px on phones
- ❌ Login screens, want-lists, or the owner's name

---

## Pre-Delivery Checklist

- [ ] Uses only the tokens above (colors, radius, shadows)
- [ ] Headings in Literata, everything else in Source Sans 3
- [ ] Buttons use `.btn` + a color class; one filled button per area
- [ ] Text contrast at least 4.5:1
- [ ] Gold focus outline visible
- [ ] No sideways scrolling at 390px; checked at 390px and 1280px
- [ ] Works with reduced motion
