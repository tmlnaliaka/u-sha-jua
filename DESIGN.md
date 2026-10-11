---
name: u-SHA-jua Response Operations
description: A field-ready incident atlas for clear, evidence-aware disaster response.
colors:
  ink: "#0F172A"
  field-paper: "#F4F6F5"
  panel-white: "#FFFFFF"
  survey-blue: "#0C4A6E"
  critical-rose: "#BE123C"
  caution-amber: "#B45309"
  confirmed-green: "#047857"
  map-slate: "#E2E8F0"
typography:
  title:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  xs: "4px"
  md: "6px"
  lg: "8px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
components:
  button-primary:
    backgroundColor: "{colors.survey-blue}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
---

# Design System: u-SHA-jua Response Operations

## Overview

**Creative North Star: "The Field Atlas Ledger"**

The administrator workspace pairs the spatial clarity of a field atlas with the traceability of an incident ledger. Cool daylight surfaces, ink-dark type, restrained survey blue, and compact, source-aware labels keep the interface legible during dispatch work without turning every status into an alarm.

The system is designed for operators scanning community reports, checking evidence, verifying incidents, and coordinating response across a map. It separates public warnings from community reports, makes verification provenance visible, and keeps survivor reporting in its own portal. On narrow screens, navigation shortens and the map and incident queue become a vertically scrollable sequence.

**Key Characteristics:**
- Operational first: the report queue, state, and next action are easy to scan.
- Geographic context with an evidence-led incident ledger.
- Flat, cool-toned surfaces; urgency colors are reserved for meaningful status.

## Colors

The palette is cool and daylight-readable: slate ink and paper carry most of the surface, survey blue marks navigation and primary actions, and the three status colors encode urgency or confirmation.

### Primary
- **Survey Blue** (#0C4A6E): Primary actions, active navigation, map controls, and location cues.

### Secondary
- **Critical Rose** (#BE123C): Critical urgency and high-priority alerts; pair with a text label and never use color alone.
- **Caution Amber** (#B45309): Medium urgency and pending states; signals attention without implying confirmation.
- **Confirmed Green** (#047857): Confirmed or resolved states, always paired with explicit wording or an icon.

### Neutral
- **Field Paper** (#F4F6F5): Main app canvas.
- **Panel White** (#FFFFFF): Report queue, navigation, forms, and inspector surfaces.
- **Ink** (#0F172A): Primary text and high-contrast labels.
- **Map Slate** (#E2E8F0): Map fallback and quiet separators.
- **Slate 300** (#CBD5E1): Standard panel and field borders.

### Named Rules
**The Provenance Stays Visible Rule.** A community report remains visibly unverified until a dispatcher confirms it; an external warning retains its source identity and never becomes a community report.

## Typography

**Display Font:** Segoe UI (with system-ui, -apple-system, BlinkMacSystemFont, sans-serif fallback)

**Body Font:** Segoe UI (with system-ui, -apple-system, BlinkMacSystemFont, sans-serif fallback)
**Label/Mono Font:** No separate mono face; use the same system stack.

**Character:** A familiar, neutral UI face supports quick scanning and predictable rendering on field devices. Weight and spacing, rather than a decorative display font, distinguish actions, state, and metadata.

### Hierarchy
- **Headline** (700, 18px, 1.5): Page titles and key inspector headings.
- **Title** (700, 16px, 1.5): Report names and section headings.
- **Body** (400, 14px, 1.5): Explanations, evidence notes, and alert details.
- **Label** (600, 12px, 1.5): Filters, timestamps, status, and compact metadata.

### Named Rules
**The State Is Text Rule.** Urgency, verification, and response status always have readable text; color is a reinforcing cue, not the sole signal.

## Layout

The application fills the viewport with a compact operational header and a dedicated page-navigation row. The overview places four small incident counts above the report queue and warning-source watch. The map page gives the map the broad desktop canvas and reserves a narrow inspector/queue rail alongside it. The public-alert center is a separate page rather than another dense dashboard panel.

Below Tailwind's `md` breakpoint, the page navigation uses concise labels, and the map and its report inspector/queue stack vertically inside a scrollable main region. Overview metrics reduce from four columns to two. Controls retain touch-friendly heights of at least 40–44px. Spacing follows a 4px base rhythm, with 8–16px for controls and compact groups and 20–24px around sections.

## Elevation & Depth

The interface is flat by default. White panels sit against the cool field-paper canvas, while thin slate borders and tonal shifts separate regions. Shadows are reserved for map markers that must remain distinct against varied tiles; they are not used as decorative lift on dashboard panels.

### Shadow Vocabulary
- **Map marker separation** (`0 2px 8px rgba(15, 23, 42, 0.48)`): Critical map marker only; lower-severity marker shadows use the same compact offset with slightly less blur and opacity.

### Named Rules
**The Flat-By-Default Rule.** Use borders and tonal surfaces for layout hierarchy; reserve shadows for geographic marker legibility.

## Shapes

Controls and panels use a restrained, mostly rectangular form language. Standard controls and panels use a 6px corner radius, compact badges use a 4px radius, and larger containers may use 8px. Thin neutral borders define edges. Circular incident markers are a map-specific symbol, not a general UI motif.

## Components

### Buttons
- **Character:** Direct and legible, with one unmistakable primary action.
- **Shape:** 6px radius; primary and secondary controls are at least 44px high.
- **Primary:** Survey-blue fill (#0C4A6E), white text, compact horizontal padding.
- **Secondary:** White fill, ink text, 1px slate border.
- **Hover / Focus:** Darken the primary slightly on hover; show a visible 2px survey-blue keyboard focus outline with offset.

### Chips
- **Style:** Compact, lightly tinted status backgrounds with dark readable text; no decorative shadow.
- **State:** Critical rose, pending/medium amber, confirmed/resolved green, with explicit status labels.

### Cards / Containers
- **Corner Style:** 6px on standard panels.
- **Background:** White on field-paper.
- **Shadow Strategy:** Flat; use a 1px slate border rather than panel elevation.
- **Border:** Slate 300 outside, lighter slate separators inside.
- **Internal Padding:** 16–20px for queue entries and content groups; 12px for dense controls.

### Inputs / Fields
- **Style:** White fill, 1px slate border, 6px radius, 14px text.
- **Focus:** 2px survey-blue outline; preserve a clear keyboard indicator.
- **Error / Disabled:** Errors use rose text and a readable message; disabled controls remain distinguishable without relying on opacity alone.

### Navigation
- **Style:** White horizontal row with a thin bottom rule and text-led links.
- **Active:** Survey-blue text and a 2px underline; inactive labels use slate text.
- **Mobile:** Keep navigation in one concise-label row; permit horizontal scrolling rather than wrapping labels.

### Incident Marker and Inspector
Incident markers encode urgency and remain visually distinct from separately styled public-warning markers. Selecting a report opens an inspector that keeps report provenance, evidence, dispatcher verification, response guidance, and status actions together. Hazard-specific guidance is available only after dispatcher confirmation.

## Do's and Don'ts

### Do:
- **Do** keep community incidents, their verification state, and external alert sources distinguishable.
- **Do** use OSM as the no-key map foundation; optional provider layers must not block map use.
- **Do** preserve keyboard focus, clear textual status, and touch-sized controls at narrow widths.

### Don't:
- **Don't** let an external public warning confirm, create, or replace a self-reported incident.
- **Don't** imply that satellite imagery is live evidence or that an empty warning feed guarantees safety.
- **Don't** use urgency colors without labels or apply marker animations to every incident.
