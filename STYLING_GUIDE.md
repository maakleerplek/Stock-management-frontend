# Brutalist Design System — Styling Guide

> **Source of truth**: Derived from the [Tv-Presentation](../Tv-Presentation/) project's visual language.
> This guide governs all styling in the Stock Management Frontend.

---

## 1. Design Philosophy

**Brutalist, raw, functional.** Every pixel earns its place. No decorative fluff — borders *are* the decoration. The design references industrial signage and print-shop aesthetics: bold type, hard edges, flat colors, tight grid layouts partitioned by heavy black rules.

### Core Tenets

| Principle | Rule |
|---|---|
| **Zero radius** | `border-radius: 0` everywhere — buttons, cards, inputs, modals, badges. |
| **Border-first** | Layouts are defined by **2px solid** borders (`border-brand-black`), not whitespace or shadows. |
| **Bold uppercase** | All labels, headings, and navigation text are `font-black uppercase tracking-widest`. |
| **Flat color** | Solid fills from the brand palette. No gradients (except subtle image backdrops). |
| **Tight grids** | Sections butt up against each other separated by borders, no floating cards. `gap-0` where grid lines already define structure. |

---

## 2. Color Palette

### Brand Colors (CSS Custom Properties)

```css
@theme {
  --color-brand-beige:      #F5F2EB;  /* Primary background */
  --color-brand-beige-dark:  #E6D5B8;  /* Secondary background / contrast areas */
  --color-brand-accent:      #C8A98B;  /* Warm accent — section headers, highlight bars */
  --color-brand-black:       #2C1E16;  /* Text, borders, and primary ink color */
}
```

### Usage Map

| Token | Tailwind | Where |
|---|---|---|
| `brand-beige` | `bg-brand-beige` | Page background, card backgrounds, QR code backgrounds |
| `brand-beige-dark` | `bg-brand-beige-dark` | Contrast sections (weather panel), image placeholders, focused inputs |
| `brand-accent` | `bg-brand-accent` | Section header strips (e.g. "Drinks, Snacks & Materialen"), accent bars |
| `brand-black` | `text-brand-black`, `border-brand-black` | All text, all structural borders |

### Semantic Colors

| Context | Color | Class |
|---|---|---|
| Workshops / Priority badges | Yellow `#FEF08A` | `bg-[#FEF08A]` |
| Events | Blue `#BFDBFE` | `bg-[#BFDBFE]` |
| News / Success | Green `#BBF7D0` | `bg-[#BBF7D0]` |
| Active / Live now | Red `#FCA5A5` | `bg-[#FCA5A5]` |
| **Adding stock** | Emerald | `text-emerald-600`, `bg-emerald-400` |
| **Removing stock** | Red | `text-red-600`, `bg-red-400` |
| **Absolute set** | Blue | `text-blue-600` |
| **Volunteer mode** | Amber | `bg-amber-200` (header), `bg-amber-300/400` (buttons) |
| Admin tools | Category → `bg-blue-200`, Location → `bg-emerald-200`, New item → `bg-amber-300` |

---

## 3. Typography

### Font Stack

| Role | Font | Source | CSS Variable |
|---|---|---|---|
| **Primary (sans)** | Space Grotesk / Inter | Google Fonts | `--font-sans` |
| **Monospace** | JetBrains Mono | Google Fonts | `--font-mono` |

> TV Presentation uses **Space Grotesk** as sans; Stock Management uses **Inter**. Both are acceptable; keep Inter for the frontend to maintain legibility at smaller sizes.

### Type Scale

| Element | Classes | Example |
|---|---|---|
| Clock / Hero numbers | `text-6xl font-black tracking-tighter` | `13:10` |
| Page headings | `text-2xl font-black uppercase tracking-widest` | `DASHBOARD` |
| Section headings | `text-lg xl:text-xl font-black uppercase tracking-tighter` | Event title |
| Section header labels | `text-xs font-black uppercase tracking-widest` | `☕ DRINKS, SNACKS & MATERIALEN` |
| Tiny labels | `text-[10px] font-black uppercase tracking-widest` | `VOLGEND EVENEMENT`, `CATEGORIES` |
| Body text | `text-sm xl:text-base font-medium` | Description paragraphs |
| Stat numbers | `text-2xl font-black` | `42` |
| Table data | `text-sm font-bold uppercase truncate` | Item names in lists |
| Version badges | `text-[9px] font-black uppercase tracking-[0.2em]` | `BETA 0.8` |

### Rules

1. **All UI labels** must be `uppercase tracking-widest font-black`.
2. Body/description text may use `font-medium` or `font-bold` in mixed case.
3. Never use `font-normal` or default weight for visible UI chrome.
4. Monospace (`font-mono`) reserved for timestamps, dates, and technical values.

---

## 4. Borders & Layout Structure

### The Border Grid System

The layout is structured like a newspaper — **rigid columns separated by heavy rules**, not floating cards with box-shadows.

```
┌──────────────┬────────────────────┬──────────────────────────┐
│  LEFT ASIDE  │  MAIN CONTENT      │  RIGHT ASIDE             │
│  (col-span-2)│  (col-span-4)      │  (col-span-6)            │
│  border-r-2  │  border-r-2        │                          │
├──────────────┼────────────────────┼──────────────────────────┤
│              FOOTER — border-t-2                              │
└───────────────────────────────────────────────────────────────┘
```

### Border Rules

| Rule | Application |
|---|---|
| Structural dividers | `border-2 border-brand-black` (always 2px, never 1px) |
| Section separators | `border-b-2 border-brand-black` between stacked sections |
| Column separators | `border-r-2 border-brand-black` or `border-l-2` between side-by-side panels |
| List item dividers | `border-b border-brand-black/30` (1px, 30% opacity) for rows within a section |
| Header strip | Full-width `border-b-2` bar with `bg-brand-accent` |
| Modal outline | `border-2 border-brand-black` on the dialog box |

### Spacing

| Context | Value |
|---|---|
| Standard padding | `p-4` |
| Large padding | `p-6` |
| Section header padding | `p-2` (compact header strips like `bg-brand-accent`) |
| Grid gaps (between bordered sections) | `gap-0` (borders create visual separation) |
| Grid gaps (within content areas) | `gap-2` to `gap-4` |
| Between stat cards | `gap-3` |

---

## 5. Interactive Elements

### Buttons

```css
@utility brutalist-button {
  border: 2px solid var(--color-brand-black);
  background-color: var(--color-brand-beige);
  padding: 0.5rem 1rem;
  font-weight: 800;
  text-transform: uppercase;
  border-radius: 0;
  cursor: pointer;
  transition: all 150ms;
  box-shadow: 4px 4px 0px 0px var(--color-brand-black);

  &:hover {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0px 0px var(--color-brand-black);
    filter: brightness(0.95);
  }

  &:active {
    transform: translate(2px, 2px);
    box-shadow: none;
  }
}
```

**Key rules:**
- Drop shadows **only on clickable buttons**, never on static cards or containers.
- Button text: `text-xs` or `text-sm`, always `font-black uppercase`.
- Use color fills for semantic meaning: `bg-amber-300` for creation, `bg-red-500` for destructive, `bg-brand-accent` for accent.

### Chip/Tag Badges

Used for event types, date labels, price tags. Based on the TV carousel chip pattern:

```html
<span class="inline-flex items-center gap-2 px-2.5 py-1 text-[10px] font-black 
             uppercase tracking-widest text-brand-black border-2 border-brand-black"
      style="background-color: #FEF08A">
  <CalendarIcon class="w-3.5 h-3.5" />
  WORKSHOP
</span>
```

- Always `border-2 border-brand-black`
- Background color carries semantic meaning (see color palette)
- `text-[10px] xl:text-xs font-black uppercase tracking-widest`

### Inputs

```css
@utility brutalist-input {
  border: 2px solid var(--color-brand-black);
  background-color: var(--color-brand-beige);
  padding: 0.5rem 0.75rem;
  border-radius: 0;
  outline: none;

  &:focus {
    background-color: var(--color-brand-beige-dark);
    box-shadow: inset 0 0 0 1px var(--color-brand-black);
  }
}
```

---

## 6. Component Patterns

### Section Header Strip

The TV-Presentation's `bg-brand-accent` header bar pattern. Used for major content section labels:

```html
<div class="p-2 border-b-2 border-brand-black bg-brand-accent shrink-0">
  <h2 class="text-brand-black uppercase tracking-widest text-xs font-black 
             flex items-center justify-center gap-2">
    <CoffeeIcon class="w-4 h-4" /> DRINKS, SNACKS & MATERIALEN
  </h2>
</div>
```

### Stat Card (Dashboard)

```html
<div class="border-2 border-brand-black p-3 bg-white">
  <div class="text-[10px] font-black uppercase tracking-widest text-brand-black/60 mb-1">
    CATEGORIES
  </div>
  <div class="text-2xl font-black">42</div>
</div>
```

### Data Table Row

Based on the TV drinks-list grid pattern:

```html
<div class="grid grid-cols-[32px_1fr_auto_auto] gap-3 items-center 
            border-b border-brand-black/30 pb-2 shrink-0">
  <!-- Thumbnail -->
  <div class="w-8 h-8 border border-brand-black bg-brand-beige-dark overflow-hidden">
    <img ... class="w-full h-full object-cover" />
  </div>
  <!-- Name -->
  <span class="text-sm text-brand-black font-bold uppercase truncate">ITEM NAME</span>
  <!-- Stock -->
  <span class="text-sm font-black text-brand-black text-center w-10">8</span>
  <!-- Price -->
  <span class="text-sm font-black text-brand-black text-right w-12">€3.00</span>
</div>
```

### Modals

```html
<!-- Overlay -->
<div class="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4">
  <!-- Dialog -->
  <div class="border-2 border-brand-black bg-white w-full max-w-md 
              shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
    <!-- Header strip (optional, for destructive modals) -->
    <div class="flex items-center justify-between p-4 border-b-3 border-brand-black bg-red-500">
      ...
    </div>
    <!-- Content -->
    <div class="p-6">...</div>
    <!-- Footer actions -->
    <div class="flex gap-4 p-4 border-t-3 border-brand-black bg-gray-50">
      <button class="flex-1 brutalist-button ...">CANCEL</button>
      <button class="flex-1 brutalist-button bg-red-500 text-white ...">CONFIRM</button>
    </div>
  </div>
</div>
```

### Navigation Tabs

```html
<div class="border-b-2 border-brand-black bg-white px-2 sm:px-6 py-0 
            flex gap-1 sm:gap-4 overflow-x-auto">
  <button class="px-3 sm:px-4 py-3 font-black uppercase tracking-widest text-[10px] sm:text-xs 
                 border-b-4 transition-all flex items-center gap-1.5
                 border-brand-black text-brand-black">
    <!-- active state: border-brand-black -->
    <!-- inactive: border-transparent text-brand-black/50 -->
    <Icon size={14} /> TAB LABEL
  </button>
</div>
```

### Clock Display

```html
<div class="flex flex-col items-center justify-center leading-none">
  <div class="text-6xl font-black tracking-tighter text-brand-black">13:10</div>
  <div class="text-sm font-black uppercase tracking-widest text-brand-black mt-2">ZA 9 MEI</div>
</div>
```

### QR Code Container

```html
<div class="border-2 border-brand-black p-1.5 bg-brand-beige">
  <QRCode value="..." size={60} bgColor="#F5F2EB" fgColor="#2C1E16" />
</div>
```

- QR background always matches `brand-beige` (`#F5F2EB`)
- QR foreground always matches `brand-black` (`#2C1E16`)
- Container: `border-2 border-brand-black`, `p-1` to `p-1.5`

### Footer

```html
<footer class="border-t-2 border-brand-black bg-brand-beige py-2 px-4 sm:px-6 mt-auto">
  <!-- Left: resource links with icon boxes -->
  <div class="flex items-center gap-3 sm:gap-6">
    <a class="flex items-center gap-2">
      <div class="border-2 border-brand-black bg-white p-1 
                  shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
        <BookIcon size={18} />
      </div>
      <div class="flex flex-col">
        <span class="text-[10px] font-black uppercase tracking-widest text-brand-black/70">READ</span>
        <span class="text-xs font-black uppercase tracking-wider">DOCS</span>
      </div>
    </a>
  </div>

  <!-- Right: version badge -->
  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-black
               border-2 border-brand-black px-2 py-1 bg-white
               shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
    BETA VERSION
  </span>
</footer>
```

---

## 7. Animations

### Framework: Framer Motion

```tsx
import { motion, AnimatePresence } from 'framer-motion';
```

### Rules

1. **Keep it fast**: 150–300ms transitions. Nothing flashy.
2. **Page transitions**: `opacity` + `x: ±20px`.
3. **List items**: `AnimatePresence` with `mode="popLayout"`.
4. **Progress bars**: CSS `@keyframes` with `scaleX` (linear, matches duration).
5. **Content swaps**: Fade + slight translateY (`0.5s cubic-bezier(0.16, 1, 0.3, 1)`).

### TV-Presentation Patterns

```css
/* Slide-fade for carousel items */
@keyframes slide-fade {
  from { opacity: 0; transform: translateY(15px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Status panel fade-in */
@keyframes status-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 8. Icons

### Library: Lucide React

```tsx
import { ShoppingCart, Plus, Minus, Coffee, QrCode, Tag, MapPin } from 'lucide-react';
```

### Standard Sizes

| Context | Size |
|---|---|
| Inside chip/badge | `size={12}` or `w-3.5 h-3.5` |
| Inline with text | `size={14}` or `size={16}` |
| Section icons | `size={20}` |
| Large display | `size={24}` |
| Feature icons (weather) | `w-12 h-12` |

---

## 9. Responsive Strategy

| Breakpoint | Behavior |
|---|---|
| Mobile (default) | Single column, stacked sections, tab-based nav |
| `sm:` (640px) | Wider padding, text labels appear alongside icons |
| `md:` (768px) | Clock visible in header, footer labels expand |
| `lg:` (1024px) | Side-by-side layouts (scanner + cart), full navigation |
| `xl:` (1280px) | Larger type scales (`xl:text-xl`, `xl:text-base`) |

### Mobile Rules

- Touch targets: minimum 44px
- Haptic feedback: `navigator.vibrate()` on scan/checkout actions
- Tab bars with `overflow-x-auto` for horizontal scroll
- Stacked sections with `border-t-2` separating panels

---

## 10. Image Handling

### Thumbnails (Data Tables)

```html
<div class="w-8 h-8 border border-brand-black bg-brand-beige-dark overflow-hidden">
  <img src="..." class="w-full h-full object-cover" />
</div>
```

### No-Image Fallback

```html
<span class="absolute inset-0 flex items-center justify-center 
             text-[8px] font-black text-brand-black uppercase text-center px-0.5">
  ITEM
</span>
```

### Large Image Containers (Carousel)

- Blurred backdrop: `object-cover scale-110 blur-xl opacity-60`
- Main image: `object-contain` on top, positioned with `z-10`

---

## 11. CSS Custom Properties & Utilities

### Defined in `src/index.css`

```css
@import "tailwindcss";

@theme {
  --color-brand-beige:      #F5F2EB;
  --color-brand-beige-dark:  #E6D5B8;
  --color-brand-accent:      #C8A98B;
  --color-brand-black:       #2C1E16;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}
```

### Custom Tailwind Utilities

| Utility | Purpose |
|---|---|
| `brutalist-border` | 2px solid brand-black border |
| `brutalist-card` | Border + bg-brand-beige, no radius |
| `brutalist-button` | Full button styling with shadow + hover/active states |
| `brutalist-input` | Input styling with focus highlight |

---

## 12. Do's and Don'ts

### ✅ DO

- Use `border-2 border-brand-black` for all structural divisions
- Use `font-black uppercase tracking-widest` for all labels
- Use semantic color fills (amber, emerald, red, blue) on a flat background
- Keep shadows only on clickable elements
- Use the `brand-accent` (`#C8A98B`) for section header strips
- Place icons inline with text in badges/buttons using `flex items-center gap-2`

### ❌ DON'T

- Don't use `border-radius` or `rounded-*` anywhere
- Don't use gradients on UI chrome (buttons, headers, cards)
- Don't use `box-shadow` on static containers/cards
- Don't use `font-normal` for any visible UI labels
- Don't use MUI component styling — use Tailwind + custom utilities only
- Don't use decorative separators or ornaments
- Don't mix border widths (1px borders only for inner list dividers with opacity)

---

## 13. File Structure

| Path | Purpose |
|---|---|
| `src/index.css` | Global theme tokens + Tailwind utilities |
| `src/lib/utils.ts` | `cn()` class merge helper |
| `src/components/` | Shared layout components (Header, Footer, Clock, etc.) |
| `src/assets/` | Static images (HTL logo, etc.) |

Components use **co-located inline Tailwind classes**, not separate CSS files. The `cn()` utility handles conditional class merging:

```tsx
import { cn } from '@/lib/utils';

<div className={cn("base-classes", isActive && "active-classes")} />
```
