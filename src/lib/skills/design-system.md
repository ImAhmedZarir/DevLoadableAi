# DevLoadable Design System & UI Craft Handbook

> The complete specification, tokens, and aesthetic principles for building modern, high-craft web applications and interfaces.

**Keywords**: design, ui, craft, devloadable, tailwind, theme, layout, component, buttons, cards, typography, styling, aesthetic, colors, dark mode

---

## 1. Aesthetic Foundations & Core Philosophy

Great modern UI is defined by **restraint, typographic hierarchy, spatial rhythm, and layered depth**. The goal is software that feels effortless, calm, and unmistakably premium on the very first screen.

### Core Commandments
1. **Never look generic:** Avoid default Bootstrap-like styles, harsh primary colors, unformatted tables, or centered blocks of unformatted text.
2. **Layered depth over flat planes:** Build depth through subtle layered neutrals, translucent surface cards, and 1px hairline borders rather than heavy, muddy drop shadows.
3. **The 90/10 Color Rule:** 90% of the screen consists of pristine, balanced neutrals (background, cards, borders, text). The remaining 10% is reserved for intentional primary accents (CTAs, key badges, active indicators).
4. **Content realism:** Never use "Lorem Ipsum", "Card Title", or "Placeholder Description". Use context-accurate terminology, believable metrics (e.g., `+18.4% MoM`, `$42,850 ARR`), and human copy.
5. **Obsessive micro-details:** Smooth transitions on hover, tactile press states (`active:scale-[0.98]`), optical alignment on icons, and consistent corner radii across the entire app.

---

## 2. Typography & Lettering

Typography does 80% of the visual heavy lifting. Master type scales and optical spacing before touching visual effects.

### Font Selection
- **Primary Workhorse (UI & Body):** `Inter`, `Geist Sans`, or `Plus Jakarta Sans`. Clean, neutral, high x-height, ultra-legible at 12–16px.
- **Editorial / Display Accent (Optional):** `Instrument Serif`, `Newsreader`, or `Playfair Display` for high-end SaaS or luxury hero headlines.
- **Monospace (Data / Code / Timestamps):** `Geist Mono`, `JetBrains Mono`, or `Fira Code`.

### Typographic Hierarchy & Tailwind Tokens
| Role | Size | Weight | Tracking | Line Height | Tailwind Classes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Display** | 48px – 72px | 700 / 800 | `-0.03em` | 1.05 – 1.1 | `text-5xl md:text-7xl font-bold tracking-tight leading-[1.08]` |
| **Page Title (H1)** | 32px – 40px | 600 / 700 | `-0.025em` | 1.15 | `text-3xl md:text-4xl font-semibold tracking-tight` |
| **Section Header (H2)**| 24px – 28px | 600 | `-0.02em` | 1.25 | `text-2xl font-semibold tracking-tight` |
| **Card / Subheader (H3)**| 18px – 20px | 600 | `-0.015em` | 1.35 | `text-lg font-semibold tracking-tight` |
| **Body (Default)** | 15px – 16px | 400 | `normal` | 1.6 – 1.65 | `text-base text-foreground/80 leading-relaxed` |
| **Subtle / Secondary** | 13px – 14px | 400 / 500 | `normal` | 1.5 | `text-sm text-muted-foreground` |
| **Micro / Caption / Badge**| 11px – 12px | 500 / 600 | `0.02em` | 1.4 | `text-xs font-medium uppercase tracking-wider` |

### Key Typographic Rules
- **Snug headings, relaxed body:** Always tighten large headlines (`tracking-tight leading-tight`). Always loosen body text (`leading-relaxed`).
- **Maximum line length:** Body paragraphs should never stretch across a full 1440px monitor. Constrain readable text to `max-w-xl` or `max-w-2xl` (~65–75 characters per line).
- **Muted secondary labels:** Use contrast hierarchy, not smaller sizes. Instead of making text 9px, keep it 13px but set it to `text-muted-foreground` or `text-zinc-500`.

---

## 3. Color Architecture & Theming

Modern interfaces utilize semantic color variables that shift effortlessly between Dark Mode and Light Mode.

### Palette Palette Disciplines (Zinc / Slate Base)

#### Dark Mode Palette
```css
--background: 240 10% 3.9%;     /* #09090b - Deep rich charcoal, not pure black */
--card: 240 10% 5.5%;           /* #0e0e12 - Elevated surface */
--card-hover: 240 10% 8%;       /* #16161c - Interactive hover surface */
--border: 240 3.7% 15.9%;       /* #27272a - Subtle hairline divider */
--foreground: 0 0% 98%;          /* #fafafa - Bright readable text */
--muted-foreground: 240 5% 64.9%;/* #a1a1aa - Calibrated secondary text */
--primary: 217 91% 60%;          /* Vibrant brand color (Electric Indigo/Blue) */
```

#### Light Mode Palette
```css
--background: 0 0% 100%;        /* #ffffff - Crisp clean canvas */
--card: 0 0% 99%;               /* #fcfcfc - Subtle off-white card */
--card-hover: 240 4.8% 95.9%;   /* #f4f4f5 - Subtle light gray hover */
--border: 240 5.9% 90%;         /* #e4e4e7 - Ultra-crisp hairline */
--foreground: 240 10% 3.9%;      /* #09090b - High-contrast charcoal text */
--muted-foreground: 240 3.8% 46.1%;/* #71717a - Secondary text */
--primary: 221 83% 53%;          /* Balanced saturated accent */
```

### Depth & Elevation Hierarchy
1. **Canvas (`bg-background`):** Base canvas level.
2. **Cards & Containers (`bg-card border border-border/50 shadow-sm`):** Lifted slightly with a 1px border.
3. **Floating Elements (`bg-card/80 backdrop-blur-md border border-border shadow-lg`):** Headers, dropdown menus, dialogs.
4. **Atmospheric Gradients (Optional):** Subtle radial backgrounds to draw the eye:
   ```html
   <div class="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"></div>
   ```

---

## 4. Spacing, Grids & Spatial Composition

Whitespace is not empty space; it is visual architecture.

### The 8-Point Geometric Scale
- **Micro adjustments:** `2px`, `4px` (`gap-1`) for badge spacing, icon nudges.
- **Component internals:** `8px`, `12px`, `16px` (`p-3`, `p-4`, `p-6`) for buttons, inputs, card padding.
- **Section rhythm:** `32px`, `48px`, `64px`, `96px`, `128px` (`py-16`, `py-24`, `py-32`) for macro spacing.

### Layout Blueprints
- **Standard App Container:** `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- **Focused Flow / Auth / Checkout:** `max-w-md mx-auto` or `max-w-lg mx-auto`
- **Dashboard Grid:**
  ```html
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
    <!-- Stat Cards -->
  </div>
  ```
- **Section Spacing on Landing Pages:** Minimum `py-20 md:py-32` between major landing page sections. Cramped spacing immediately signals amateur design.

---

## 5. UI Components & Craft Polish

### 1. Buttons
Buttons should feel tactile, crisp, and unambiguous.
- **Primary:** High-contrast solid color, subtle shadow, slight hover brightness shift.
  ```html
  <button class="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-150 hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">
    Get Started
    <ChevronRight class="ml-1.5 h-4 w-4" />
  </button>
  ```
- **Secondary / Subtle:**
  ```html
  <button class="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background/60 px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted active:scale-[0.98]">
    Documentation
  </button>
  ```

### 2. Cards & Containers
- Standardize border radii across your UI. Pick one family:
  - **Modern Sleek:** `rounded-xl` (12px) for cards, `rounded-lg` (8px) for buttons/inputs.
  - **Playful / Pill:** `rounded-2xl` (16px) for cards, `rounded-full` for badges/buttons.
- **Surface Recipe:**
  ```html
  <div class="rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-200 hover:border-border hover:shadow-md">
    <!-- Card Content -->
  </div>
  ```

### 3. Glassmorphic Navigation Bar
```html
<header class="sticky top-4 z-50 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  <div class="flex items-center justify-between rounded-2xl border border-border/50 bg-background/70 px-6 py-3 shadow-lg backdrop-blur-xl">
    <div class="flex items-center gap-2">
      <div class="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">L</div>
      <span class="font-semibold tracking-tight text-foreground">Brand</span>
    </div>
    <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
      <a href="#" class="transition-colors hover:text-foreground">Product</a>
      <a href="#" class="transition-colors hover:text-foreground">Features</a>
      <a href="#" class="transition-colors hover:text-foreground">Pricing</a>
    </nav>
    <div class="flex items-center gap-3">
      <button class="text-sm font-medium text-muted-foreground hover:text-foreground">Sign In</button>
      <button class="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90">Start Free</button>
    </div>
  </div>
</header>
```

### 4. Stat & Metric Cards
- Emphasize the metric, de-emphasize the label, and provide clear delta indicators:
```html
<div class="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
  <div class="flex items-center justify-between">
    <p class="text-sm font-medium text-muted-foreground">Monthly Recurring Revenue</p>
    <span class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">+14.2%</span>
  </div>
  <p class="mt-2 text-3xl font-bold tracking-tight text-foreground">$48,290</p>
  <p class="mt-1 text-xs text-muted-foreground">vs. $42,300 last month</p>
</div>
```

### 5. Badges & Status Indicators
- Keep badges compact and semi-transparent. Avoid solid primary colors on badges:
```html
<span class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
  <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
  Live Production
</span>
```

---

## 6. Micro-Interactions & Transitions

Polished interfaces communicate responsiveness through continuous, subtle physics:

1. **Duration & Curve Standards:**
   - Color / background shifts: `duration-150 ease-out`
   - Transform / scale / elevation: `duration-200 ease-out`
   - Modal / slide-over panels: `duration-300 cubic-bezier(0.16, 1, 0.3, 1)` (spring-like ease-out)
2. **Tactile Clicks:** Add `active:scale-[0.98]` on buttons and clickable cards.
3. **Hover Elevation:** On interactive cards:
   ```css
   transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-border
   ```
4. **Loading States:** Shimmer skeletons using `animate-pulse` with `bg-muted/60` and matched corner radiuses.

---

## 7. Icons & Imagery

- **Icon Set:** Standardize on **Lucide React** or **Phosphor Icons**. Never mix multiple disparate icon sets.
- **Icon Sizing Scale:**
  - Micro (inline with 12px text): `h-3.5 w-3.5` (14px)
  - Standard (inline with button / input): `h-4 w-4` (16px) or `h-5 w-5` (20px)
  - Feature Card Hero Icon: `h-6 w-6` inside a `p-2.5 rounded-xl bg-primary/10 text-primary` container.
- **Stroke Width:** Default to `stroke-width={1.75}` or `stroke-width={2}` for balanced optical weight.
- **Aspect Ratios on Images:** Always enforce clean containers with `aspect-video`, `aspect-[4/3]`, or `aspect-square` with `object-cover rounded-xl`.

---

## 8. Master System Prompt Template for Any AI Model

```text
You are an elite Product Designer and Front-End Engineer specializing in modern, high-craft web applications.

When designing or coding interfaces, adhere strictly to these principles:
1. TYPOGRAPHY: Use Inter, Geist, or Plus Jakarta Sans. Large headings must use tight tracking (tracking-tight) and compact line-height. Body text must be comfortably spaced (leading-relaxed, text-muted-foreground).
2. COLOR & DEPTH: Restrict brand colors to a 90/10 ratio. 90% neutral slate/zinc canvas; 10% purposeful primary accents. Use 1px subtle borders (border-border/50), layered surfaces, and soft diffuse shadows rather than heavy drop shadows.
3. SPACING: Rely on an 8px grid. Use generous vertical rhythm for sections (py-20 to py-32). Keep containers constrained (max-w-7xl).
4. COMPONENT CRAFT:
   - Buttons must have tactile active press states (active:scale-[0.98]) and smooth transitions (duration-150).
   - Cards must feature subtle hairline borders (border-border/60), rounded-xl or rounded-2xl radii, and hover elevation.
   - Use Lucide icons sized consistently at 16px to 20px.
   - Headers should be floating sticky bars with backdrop-blur-md and semi-transparent backgrounds.
5. CONTENT REALISM: Never produce "Lorem Ipsum" or generic placeholder text. Populate every view with realistic industry metrics, human names, and contextual copy.
6. RESPONSIVENESS: Ensure mobile-first flexibility with clean collapse to single-column layouts on small screens.
```
