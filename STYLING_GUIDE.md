# Styling Guide

The app follows the look of [maakleerplek.be](https://maakleerplek.be/nl): white and warm-grey surfaces, ink text, thin grey rules, flat buttons, normal-case type. All tokens live in `src/index.css`.

## Colours

| Token | Value | Use |
|---|---|---|
| `brand-beige` | `#FFFFFF` | Page and card background |
| `brand-beige-dark` | `#F1F0EC` | Bands, table heads, footer, hover |
| `brand-accent` | `#E3E1DB` | Selected / pressed surfaces |
| `brand-black` | `#171717` | Text, primary buttons, active tab underline |
| `grafiet` | `#5B5C55` | Secondary text, inactive tabs |
| `lijn` | `#D8D7D1` | Every border and divider |
| `rood` | `#B3261E` | Errors, destructive actions |

The Tailwind hues used for meaning are remapped in `@theme` onto the site's agenda categories, so existing classes keep their meaning with the site's colours:

| Meaning | Classes | Site category |
|---|---|---|
| Add stock / success | `emerald-*`, `green-*` | open lab `#CCDC9C` / `#4A5C22` |
| Remove / error | `red-*`, `rose-*` | rood `#B3261E`, rood-vlak `#FBEAE8` |
| Set absolute / info | `blue-*`, `sky-*` | workshop `#CCDCF4` / `#2F4F85` |
| Volunteer / create | `amber-*`, `yellow-*` | herstel `#ECB47C` / `#7F4A12` |
| Supplier | `purple-*` | jongeren `#C4B4E4` |

A coloured tile uses the light fill plus a 4px left border in the deep shade (`bg-amber-300 border-l-4 border-amber-700`), like the agenda on the site.

## Type

- Sans: Schibsted Grotesk (400–700). Serif: Literata, for longer reading text only. Both load from Google Fonts in `index.html`.
- Mono: `ui-monospace`, for times, barcodes and prices per unit.
- Sentence case everywhere. No `uppercase`, no wide tracking.
- Headings `font-semibold`, labels `font-medium`, body `font-normal`.

| Element | Classes |
|---|---|
| Page heading | `text-2xl font-semibold tracking-tight` |
| Section heading | `text-base font-semibold` |
| Small label | `text-xs font-medium text-grafiet` |
| Body | `text-sm` |

## Structure

- Borders are 1px `border-lijn`. The header has a darker bottom rule (`border-brand-black/80`).
- No border radius, no shadows, no gradients.
- Section headings sit left-aligned in a white strip: `px-4 sm:px-6 py-3 border-b border-lijn`.
- Modals: `bg-brand-black/50` overlay, white dialog with `border border-lijn`.

## Controls

| Utility | Look |
|---|---|
| `brutalist-button` | White, 1px ink outline, `font-medium`. Add a `bg-*` class for a coloured variant. |
| `btn-primary` | Combine with `brutalist-button`: solid ink, white text. One per view. |
| `brutalist-input` | 1px `lijn` border, turns ink on focus. |
| `brutalist-card` | White with 1px `lijn` border. |

Navigation tabs: `text-sm font-medium`, inactive `text-grafiet`, active `border-b-2 border-brand-black`.

## Icons

`lucide-react`: 14px inline with small text, 16px in buttons, 20–24px for empty states.

## Favicon and PWA icons

`public/` holds the HTL cube (white, monochrome) on an ink square. To regenerate, use `Logo final_WHITE_RGB_PNG_CUBE.png` from the HTL logo folder with ImageMagick: trim the logo, then composite it centred on a `#171717` square.
