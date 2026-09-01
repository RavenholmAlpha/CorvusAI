---
name: Axiom Technical Interface
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#e2bfb0'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#a98a7d'
  outline-variant: '#5a4136'
  surface-tint: '#ffb693'
  primary: '#ffb693'
  on-primary: '#561f00'
  primary-container: '#ff6b00'
  on-primary-container: '#572000'
  inverse-primary: '#a04100'
  secondary: '#c8c6c5'
  on-secondary: '#303030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#c8c6c5'
  on-tertiary: '#303030'
  tertiary-container: '#9a9999'
  on-tertiary-container: '#313131'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbcc'
  primary-fixed-dim: '#ffb693'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#7a3000'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1b1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e4e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  sidebar-width: 280px
  inspector-width: 320px
---

## Brand & Style
This design system is engineered for high-fidelity AI agent orchestration. The brand personality is clinical, high-performance, and authoritative, drawing inspiration from developer tools and aerospace telemetry interfaces. 

The aesthetic combines **Minimalism** with **Glassmorphism** and **Technical Utility**. It prioritizes information density and reduced visual noise to facilitate long-form cognitive work. The interface should feel like a precision instrument: cold, stable backgrounds contrasted by high-energy, "active" interactive states.

**Key Visual Principles:**
- **Extreme Precision:** Every element is aligned to a strict grid; nothing is decorative without being functional.
- **Dynamic Vitality:** Use the primary accent color to represent "intelligence in flight"—processing states, active agents, and critical actions.
- **Layered Context:** Use translucency to maintain user orientation within complex project hierarchies.

## Colors
The palette is rooted in a deep "Obsidian" scale to minimize eye strain during extended sessions. 

- **Base (#121212):** The primary canvas color.
- **Surface (#1E1E1E):** Used for elevated containers, sidebars, and inactive panels.
- **Accent (#FF6B00):** Reserved exclusively for "Human-in-the-loop" actions, active AI processing indicators, and high-priority status updates.
- **Functional Grays:** A range of slates are used to create hierarchy in metadata and technical logs.

Maintain high contrast for readability; text should never drop below a 4.5:1 ratio against its immediate background. Use the primary orange sparingly to maintain its psychological impact as a "call to attention."

## Typography
The typographic system utilizes a dual-engine approach. **Geist/Inter** handles the structural UI and narrative content, providing a modern, neutral clarity. **JetBrains Mono** is employed for technical data, status logs, agent addresses, and configuration strings to signal "System Output."

- **Headlines:** Tight tracking and semi-bold weights for a compact, professional look.
- **Labels:** Small-caps or all-caps mono-spaced type for metadata tags (e.g., [RUNNING], [IDLE]).
- **Information Density:** Body text is set at 14px to allow for more content on screen without sacrificing legibility on high-DPI displays.

## Layout & Spacing
The layout follows a **Fixed-Fluid-Fixed** 3-column architecture optimized for desktop workflows:
1. **Navigation/Context (Left):** Fixed width (280px). Houses project trees and global navigation.
2. **Orchestration Canvas (Center):** Fluid. The main workspace for AI chat, code blocks, and agent logs.
3. **Inspector/Utility (Right):** Fixed width (320px). Contains agent parameters, context variables, and performance metrics.

**Spacing Rhythm:**
Use a strict 4px base unit. 
- Sidebars use 12px internal padding for density.
- Main canvas uses 24px padding to provide "breathing room" for complex logic.
- Content cards are separated by 8px gutters to maintain a cohesive "dashboard" feel.

## Elevation & Depth
This design system rejects traditional drop shadows in favor of **Tonal Layering** and **Glassmorphism**.

- **Level 0 (Base):** #121212. Global background.
- **Level 1 (Panels):** #1E1E1E with a 1px solid border (rgba(255,255,255, 0.05)).
- **Level 2 (Overlays/Modals):** Semi-transparent surfaces (rgba(30, 30, 30, 0.8)) with a 40px backdrop-blur. This keeps the underlying project context visible while focusing on the task at hand.
- **Active State:** Elements currently in focus are indicated by a 1px #FF6B00 border rather than a shadow, reinforcing the technical, "active circuit" aesthetic.

## Shapes
The shape language is **Soft (0.25rem)**. While a technical interface often leans toward sharp corners, a slight 4px radius prevents the UI from feeling aggressive or dated. 

- **Inputs & Buttons:** 4px radius.
- **Main Containers:** 8px (rounded-lg) for outer layout wrappers.
- **Status Pills:** Fully rounded (pill) to distinguish them from interactive buttons.
- **Selection Brackets:** Use sharp corners for code selection or grid-highlighting to maintain a "targeting" feel.

## Components
- **Primary Action Button:** Background: #FF6B00; Text: #121212 (Bold); Radius: 4px. On hover, apply a slight white inner glow (top-down).
- **Secondary Ghost Button:** Background: Transparent; Border: 1px solid rgba(255,255,255, 0.2); Text: #FFFFFF.
- **Context Cards:** Background: #1E1E1E; Subtle 1px top-border (white, 0.1 opacity) to simulate a light catch.
- **Terminal Inputs:** Monospaced text, no background, 1px bottom-border. The cursor should be a solid #FF6B00 block.
- **Agent Status Chips:** 
    - `Active`: Orange border, orange text, pulse animation.
    - `Inactive`: Gray border, gray text.
    - `Success`: Green text (system green), no fill.
- **Data Tables:** Zebra striping using #121212 and #181818. No vertical borders. Header row uses `label-xs` typography.
- **Scrollbars:** Custom thin 4px tracks, dark gray, visible only on hover.