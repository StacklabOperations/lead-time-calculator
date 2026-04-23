[STACKABL_APPS_STYLE_GUIDE.md](https://github.com/user-attachments/files/27021833/STACKABL_APPS_STYLE_GUIDE.md)
# Operations Toolkit — Style Guide

Design language for all tools in the STACKABL Operations Toolkit.

---

## Principles

- **Two modes, one system.** Every tool ships with both dark and light modes via CSS custom properties. Dark is default.
- **Two text colours only per mode.** High-emphasis and body text — no more than two neutrals in use at a time.
- **Two type sizes only.** `1.1rem` bold for dominant numbers. `0.75rem` for labels and secondary text.
- **Minimal decoration.** No gradients, shadows, or rounded corners (except `border-radius: 2px` on inputs/buttons). Borders are always subtle.
- **Uppercase labels.** All labels and button text are `text-transform: uppercase` with wide letter-spacing.

---

## Colour Palette

All colours are delivered via CSS custom properties. Override `[data-theme="light"]` to switch modes.

### Dark Mode (default)

| Variable | Hex | Role |
|----------|-----|------|
| `--bg` | `#000000` | Page background |
| `--bg-card` | `#0d0d0d` | Card / panel background |
| `--bg-hover` | `#111111` | Hover / active surface |
| `--border` | `#1e1e1e` | Card borders, dividers |
| `--border-mid` | `#222222` | Input borders |
| `--border-strong` | `#333333` | Emphasis borders |
| `--text-hi` | `#E6E6E6` | Dominant values, headings |
| `--text` | `#BFBFBF` | Body text, labels |
| `--text-muted` | `#555555` | Secondary labels, hints |
| `--text-ghost` | `#444444` | Placeholder-level content |
| `--btn-bg` | `#BFBFBF` | Primary button background |
| `--btn-color` | `#000000` | Primary button text |
| `--btn-hover` | `#E6E6E6` | Primary button hover |
| `--btn-dis-bg` | `#333333` | Disabled button background |
| `--btn-dis-color` | `#666666` | Disabled button text |
| `--ghost-color` | `#DDDDDD` | Ghost button text |
| `--ghost-border` | `#222222` | Ghost button border |
| `--ghost-hover` | `#555555` | Ghost button border hover |
| `--progress-bg` | `#111111` | Progress bar track |
| `--progress-fill` | `#BFBFBF` | Progress bar fill |

### Light Mode

| Variable | Hex | Role |
|----------|-----|------|
| `--bg` | `#f2f2f2` | Page background |
| `--bg-card` | `#ffffff` | Card / panel background |
| `--bg-hover` | `#e8e8e8` | Hover / active surface |
| `--border` | `#e0e0e0` | Card borders, dividers |
| `--border-mid` | `#cccccc` | Input borders |
| `--border-strong` | `#bbbbbb` | Emphasis borders |
| `--text-hi` | `#111111` | Dominant values, headings |
| `--text` | `#333333` | Body text, labels |
| `--text-muted` | `#888888` | Secondary labels, hints |
| `--text-ghost` | `#aaaaaa` | Placeholder-level content |
| `--btn-bg` | `#111111` | Primary button background |
| `--btn-color` | `#ffffff` | Primary button text |
| `--btn-hover` | `#333333` | Primary button hover |
| `--btn-dis-bg` | `#cccccc` | Disabled button background |
| `--btn-dis-color` | `#999999` | Disabled button text |
| `--ghost-color` | `#333333` | Ghost button text |
| `--ghost-border` | `#cccccc` | Ghost button border |
| `--ghost-hover` | `#888888` | Ghost button border hover |
| `--progress-bg` | `#e0e0e0` | Progress bar track |
| `--progress-fill` | `#333333` | Progress bar fill |

### Functional Colours (both modes)

| Hex | Usage |
|-----|-------|
| `#4CAF50` | Success, found, done |
| `#FF9800` | Warning, released state, new revision |
| `#f44336` | Error, not found |

---

## Typography

**Font stack:** `'Helvetica Neue', Helvetica, Arial, sans-serif`

| Element | Size | Weight | Letter-spacing | Transform |
|---------|------|--------|----------------|-----------|
| Page / tool title | `0.75rem` | 700 | `0.22em` | uppercase |
| Subtitle / nav link | `0.65–0.7rem` | 400 | `0.08–0.2em` | uppercase |
| Labels | `0.65rem` | 400 | `0.14em` | uppercase |
| Label hints | `0.65rem` | 400 | `0.06em` | none |
| Dominant result value | `1.1rem` | 700 | `0.01em` | none |
| Large display value | `2rem` | 700 | `0.01em` | none |
| Secondary / breakdown text | `0.75rem` | 400 | `0.04–0.1em` | none |
| Button text | `0.62rem` | 800 | `0.18em` | uppercase |
| Ghost button text | `0.6rem` | 700 | `0.18em` | uppercase |

---

## Layout

- **Max content width:** `560px` for single-column tools (calculators)
- **Card padding:** `36px`
- **Body padding:** `40px 20px`
- **Input group spacing:** `20px` margin-bottom
- **Section dividers:** `<hr>` with `border-top: 1px solid #1a1a1a`, `margin: 28px 0`

---

## Components

### Theme Toggle

Place in the nav row (flex, space-between). Reads/writes `localStorage` key `stackabl-theme`.

```html
<button class="theme-toggle" id="themeToggle" onclick="toggleTheme()">Light Mode</button>
```

```css
.theme-toggle {
  background: transparent; border: 1px solid var(--border-mid);
  color: var(--text-muted); border-radius: 2px;
  padding: 5px 10px; font-size: 0.58rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer;
}
.theme-toggle:hover { border-color: var(--text-muted); color: var(--text); }
```

```js
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') !== 'light' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('stackabl-theme', next);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent =
    theme === 'light' ? 'Dark Mode' : 'Light Mode';
}
applyTheme(localStorage.getItem('stackabl-theme') || 'dark');
```

### Nav / Back Link
```html
<div class="nav">
    <a href="../index.html">← Operations Toolkit</a>
</div>
```
- Font: `0.65rem`, `letter-spacing: 0.2em`, uppercase
- Color: `#444` at rest → `#BFBFBF` on hover
- Margin-bottom: `40px`

### Tool Card (wrapper)
```css
background: #0d0d0d;
border: 1px solid #1e1e1e;
border-radius: 4px;
padding: 36px;
max-width: 560px;
```

### Inputs (number, date, text)
```css
background: #000;
border: 1px solid #222;
color: #E6E6E6;
border-radius: 2px;
padding: 10px 14px;
font-size: 0.9rem;
```
Focus state: `border-color: #555`, no outline.

### Primary Button (Calculate / Load)
```css
background: #BFBFBF;
color: #000;
border: none;
border-radius: 2px;
padding: 12px;
font-size: 0.62rem;
font-weight: 800;
letter-spacing: 0.18em;
text-transform: uppercase;
```
Hover: `background: #ddd`

### Ghost Button (Refresh / Copy)
```css
background: transparent;
border: 1px solid #222;
color: #DDDDDD;
border-radius: 2px;
padding: 8px 16px;
font-size: 0.6rem;
font-weight: 700;
letter-spacing: 0.18em;
text-transform: uppercase;
```
Hover: `border-color: #666`, `background: #0a0a0a`

### Result Breakdown Panel
```css
background: #000;
border: 1px solid #1a1a1a;
border-radius: 2px;
padding: 16px;
```
Row layout: `display: flex; justify-content: space-between`
- Label: `color: #555`, `font-size: 0.75rem`
- Value: `color: #BFBFBF`, `font-size: 0.75rem`

---

## Index Page — Tool Button Cards

```css
background: #111;
border: 1px solid #222;
border-radius: 16px;
width: 200px;
height: 200px;
color: #BFBFBF;
```
Hover: `background: #1a1a1a`, `border-color: #444`, `transform: translateY(-4px)`

Tool name: `0.72rem`, `font-weight: 500`, `letter-spacing: 0.12em`, uppercase

**Featured card** (Live Inventory):
```css
background: #000;
border: 1px solid #333;
color: #E6E6E6;
```
With pulsing live dot:
```css
width: 6px; height: 6px; border-radius: 50%;
background: #E6E6E6;
animation: blink 1.8s ease-in-out infinite;
```

---

## Watermark (dashboard pages only)

STACKABL SVG logo tiled at 45°, `opacity: 0.07`, as `body::before` pseudo-element. Visible in the grid gutters. Not used on simple calculator tools.

---

## Splash / Loading Screen (data-driven pages only)

Full-screen `#000` overlay with:
- Centred STACKABL SVG logo (`width: 360px`, `opacity: 0.92`)
- Subtitle: `0.72rem`, `letter-spacing: 0.36em`, uppercase, `#BFBFBF`
- Three pulsing dots (`#444` → `#BFBFBF`, 1.2s stagger)
- Fades out in `0.6s` when data is ready

---

## File Naming Conventions

```
tools/
  lead-time-calculator.html
  safety-stock-calculator.html
  felt-inventory.html
assets/
  swatches/       ← colour swatch images named {code}.jpg (e.g. 023.jpg)
  css/            ← shared styles (if needed in future)
index.html        ← toolkit landing page
STYLE_GUIDE.md    ← this file
```

---

## Adding a New Tool

1. Copy the card/nav structure from `safety-stock-calculator.html` as a starting template.
2. Use only the colours, sizes, and components defined above.
3. Add a button to `index.html` — icon + short uppercase name, no description needed.
4. Link back with `← Operations Toolkit` nav link at the top.
