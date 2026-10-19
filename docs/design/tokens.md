# umless: design tokens

Calm, focused and low-stress: practising out loud is uncomfortable enough. The palette is neutral with one indigo accent. Red is used only for "recording live" and destructive actions, and amber only for filler highlights and time warnings.

Contrast ratios were computed with the WCAG 2.1 relative-luminance formula on 2026-10-19. Every text pairing is ≥ 4.5:1.

## Colour

| Token | Light | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `--color-bg` | `#FFFFFF` | `#0E1014` | page background | — |
| `--color-surface` | `#F5F6F8` | `#171A20` | cards, list rows, dialogs | — |
| `--color-border` | `#CDD2DA` | `#2F343D` | dividers, inputs (non-text) | — |
| `--color-text` | `#16181D` | `#E9EBEF` | body text | 17.76 / 15.95 on bg; 16.42 / 14.60 on surface |
| `--color-text-muted` | `#4A5260` | `#A3AAB6` | secondary text, timestamps, pause dots | 7.87 / 8.14 on bg; 7.28 / 7.45 on surface |
| `--color-primary` | `#4338CA` | `#A5B4FC` | primary buttons, links, focus ring | 7.90 / 9.55 on bg; 7.31 / 8.74 on surface |
| `--color-on-primary` | `#FFFFFF` | `#0E1014` | text on primary buttons | 7.90 / 9.55 |
| `--color-record` | `#C81E1E` | `#F87171` | recording dot, Stop button | 5.74 / 6.88 on bg |
| `--color-on-record` | `#FFFFFF` | `#0E1014` | text on the Stop button | 5.74 / 6.88 |
| `--color-success` | `#166534` | `#4ADE80` | "Saved", "Copied" | 7.13 / 10.93 on bg |
| `--color-warning` | `#92400E` | `#FBBF24` | countdown, quiet-mic hint | 7.09 / 11.41 on bg |
| `--color-danger` | `#B91C1C` | `#FCA5A5` | errors, Delete | 6.47 / 10.03 on bg; 5.98 / 9.18 on surface |
| `--color-filler-bg` | `#FDECC8` | `#3D2A08` | filler-word highlight background | — |
| `--color-filler-text` | `#713F12` | `#FDE68A` | filler-word text | 7.44 / 11.00 on filler-bg |

Never use colour alone: fillers are also bold, errors carry an icon and text, and the recording dot comes with the word "Recording".

## Type scale

System font stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Monospace for the timer: `ui-monospace, "Cascadia Mono", Consolas, monospace` with tabular numerals.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `--text-xs` | 12px / 16px | 500 | badges, counters |
| `--text-sm` | 14px / 20px | 400 | secondary text, hints |
| `--text-md` | 16px / 24px | 400 | body, inputs, buttons (16px avoids iOS zoom) |
| `--text-lg` | 20px / 28px | 600 | section headings |
| `--text-xl` | 24px / 32px | 600 | page title |
| `--text-2xl` | 32px / 40px | 600 | practice question (24px under 600px) |
| `--text-timer` | 48px / 56px | 600 mono | recording timer |

## Spacing (4px base)

`--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-5` 24px · `--space-6` 32px · `--space-7` 48px · `--space-8` 64px

## Radius, shadow, motion, sizes

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | inputs, chips |
| `--radius-md` | 10px | buttons, list rows |
| `--radius-lg` | 16px | cards, dialogs |
| `--radius-full` | 999px | record button, badges |
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.06)` | rows (light only) |
| `--shadow-md` | `0 4px 16px rgb(0 0 0 / 0.10)` | cards, toasts |
| `--shadow-lg` | `0 12px 40px rgb(0 0 0 / 0.18)` | dialogs |
| `--duration-fast` | 120ms | hover, focus |
| `--duration-base` | 200ms | state changes |
| `--touch-target` | 48px | minimum height for buttons and rows |
| `--content-width` | 720px | max width of the main column |

## Breakpoints

| Token | Min width | Layout |
|---|---|---|
| (base) | 0 | single column, 16px gutters, sticky bottom action bar on the practice screen |
| `--bp-sm` | 600px | larger practice heading, actions inline |
| `--bp-md` | 900px | result: summary beside the transcript |
| `--bp-lg` | 1200px | content centred at `--content-width` (result up to 1040px) |

## CSS custom properties

```css
:root {
  color-scheme: light dark;

  --color-bg: #FFFFFF;
  --color-surface: #F5F6F8;
  --color-border: #CDD2DA;
  --color-text: #16181D;
  --color-text-muted: #4A5260;
  --color-primary: #4338CA;
  --color-on-primary: #FFFFFF;
  --color-record: #C81E1E;
  --color-on-record: #FFFFFF;
  --color-success: #166534;
  --color-warning: #92400E;
  --color-danger: #B91C1C;
  --color-filler-bg: #FDECC8;
  --color-filler-text: #713F12;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
  --text-xs: 12px;  --leading-xs: 16px;
  --text-sm: 14px;  --leading-sm: 20px;
  --text-md: 16px;  --leading-md: 24px;
  --text-lg: 20px;  --leading-lg: 28px;
  --text-xl: 24px;  --leading-xl: 32px;
  --text-2xl: 32px; --leading-2xl: 40px;
  --text-timer: 48px; --leading-timer: 56px;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px; --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --shadow-md: 0 4px 16px rgb(0 0 0 / 0.10);
  --shadow-lg: 0 12px 40px rgb(0 0 0 / 0.18);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --touch-target: 48px;
  --content-width: 720px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: #0E1014;
    --color-surface: #171A20;
    --color-border: #2F343D;
    --color-text: #E9EBEF;
    --color-text-muted: #A3AAB6;
    --color-primary: #A5B4FC;
    --color-on-primary: #0E1014;
    --color-record: #F87171;
    --color-on-record: #0E1014;
    --color-success: #4ADE80;
    --color-warning: #FBBF24;
    --color-danger: #FCA5A5;
    --color-filler-bg: #3D2A08;
    --color-filler-text: #FDE68A;
    --shadow-sm: none;
    --shadow-md: 0 4px 16px rgb(0 0 0 / 0.5);
    --shadow-lg: 0 12px 40px rgb(0 0 0 / 0.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; }
}
```

Breakpoints can't be custom properties inside media queries, so use the literal values: `@media (min-width: 600px)`, `900px`, `1200px`.
