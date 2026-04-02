# Brutalist Design System - Styling Guide

This document outlines the design principles and CSS conventions used in the Stock Management Frontend application.

## Design Philosophy

This application follows a **brutalist design** aesthetic - raw, unpolished, and functional. The design prioritizes clarity and usability over decorative elements.

## Core Principles

### 1. Borders
- Use **3px solid black borders** (`border-3 border-brand-black`)
- No rounded corners - all elements should have sharp edges (`rounded-none` or no border-radius)
- Borders should be visible and prominent

### 2. Shadows
- **Drop shadows only on clickable buttons** - not on static elements
- Standard button shadow: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`
- Hover state: `shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]` with slight translate
- Active state: `shadow-none` with translate to simulate press

### 3. Typography
- **Bold uppercase** for headings and labels (`font-black uppercase tracking-widest`)
- Font sizes:
  - Large headings: `text-xl` to `text-2xl`
  - Regular headings: `text-sm` to `text-lg`
  - Labels: `text-[10px]` to `text-xs`
- Use Inter as the primary font

### 4. Colors

#### Checkout Mode (Customer-facing)
- Background: `bg-brand-beige` (#eadec4)
- Accents: `bg-brand-beige-dark` (#dfcea9)
- Primary text: `text-brand-black` (#1e1b18)

#### Volunteer Mode (Admin/Staff)
- Background: **White/Gray only** (`bg-white`, `bg-gray-50`, `bg-gray-100`)
- **NO beige/brown colors** in volunteer mode
- Header accent: `bg-amber-200` to indicate volunteer mode
- Primary text: `text-brand-black`

#### Feedback Colors
- **Adding stock**: Green (`text-emerald-600`, `bg-emerald-400`)
- **Removing stock**: Red (`text-red-600`, `bg-red-400`)
- **Setting absolute values**: Blue (`text-blue-600`)

### 5. Interactive Elements

#### Buttons
```css
/* Standard brutalist button */
.brutalist-button {
  border: 2px solid var(--color-brand-black);
  background-color: white;
  padding: 0.5rem 1rem;
  font-weight: 800;
  text-transform: uppercase;
  box-shadow: 4px 4px 0px 0px var(--color-brand-black);
  cursor: pointer;
}

.brutalist-button:hover {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0px 0px var(--color-brand-black);
  filter: brightness(0.95);
}

.brutalist-button:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
```

#### Inputs
```css
.brutalist-input {
  border: 2px solid var(--color-brand-black);
  background-color: white;
  padding: 0.5rem 0.75rem;
  outline: none;
}

.brutalist-input:focus {
  background-color: #f5f5f5;
  box-shadow: inset 0 0 0 1px var(--color-brand-black);
}
```

### 6. Cards and Containers
- Use `border-2 border-brand-black` for all card borders
- Background: `bg-white`
- No shadows on static cards
- Modal backgrounds use `bg-brand-black/80` overlay

### 7. Spacing
- Use consistent padding: `p-4` for standard, `p-6` for larger areas
- Gaps between elements: `gap-2` to `gap-4`
- Responsive padding: `p-4 sm:p-6` for mobile-first approach

## Component Patterns

### Shopping Cart
- 40% width on large screens (`lg:w-[40%]`)
- Border on left: `border-l-3 border-brand-black`
- Header with icon and uppercase title
- Stock change preview with color coding

### Admin Tools Bar
- Horizontal bar below navigation
- Contains quick action buttons for New Item, Add Category, Add Location
- Visible on all volunteer views except InvenTree panel

### Modals
- Overlay: `fixed inset-0 bg-brand-black/80 z-50`
- Content box: `border-2 border-brand-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Close on backdrop click

## Mobile Considerations

- Use responsive breakpoints: `sm:`, `md:`, `lg:`
- Stack layouts vertically on mobile
- Larger touch targets (minimum 44px)
- Haptic feedback via `navigator.vibrate()` for touch interactions
- Horizontal scroll for tabs with `overflow-x-auto`

## Icons

Use **Lucide React** icons exclusively:
```tsx
import { ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';
```

Standard sizes:
- Small: `size={14}` or `size={16}`
- Medium: `size={20}`
- Large: `size={24}` or `size={36}`

## Animations

Use **Framer Motion** for animations:
- Page transitions: `opacity` and `x` transforms
- List items: `AnimatePresence` with `mode="popLayout"`
- Keep animations subtle and fast (150-300ms)

## CSS Custom Properties

Defined in `src/index.css`:
```css
@theme {
  --color-brand-beige: #eadec4;
  --color-brand-beige-dark: #dfcea9;
  --color-brand-black: #1e1b18;
}
```

## File Structure

- Global styles: `src/index.css`
- Utility functions: `src/lib/utils.ts` (includes `cn()` for class merging)
- Components follow co-location pattern with their styles inline via Tailwind classes
