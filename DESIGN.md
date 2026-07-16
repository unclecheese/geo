# GeoBean — Design Guidelines

Reference mockups: `GeoBean Redesign.html` (final direction = the "4a" language: homepage + setup + play screens + mobile).

## Concept

Playful arcade-sticker UI on a muted stage. The background is calm and desaturated; energy comes entirely from the CTAs, badges, and card borders. Cards sit slightly tilted like stickers on a board. Everything has hard offset shadows — no blurs, no gradients on UI elements.

## Color

Stage (muted — never brighten these):
- `#2c3554` — app background (dusk indigo)
- Dot grid overlay: `radial-gradient(rgba(255,255,255,0.07) 1.5px, transparent 1.5px)`, `background-size: 30px 30px` (0.05 alpha behind maps)
- `#232b45` — hairline dividers on the stage
- `#a9b2cd` — secondary text on stage; `#7d87a8` — tertiary/labels

Surfaces:
- `#f2f0e9` — card paper; `#fff` — inputs & inner controls
- `#dcd7c8` — progress track / inner dividers; `#c9c4b4` — disabled borders

Ink:
- `#14182b` — universal ink: text on paper, borders, hard shadows
- `#4e5470` — body copy on paper

Accents (saturated — reserved for interaction & emphasis):
- `#ffb020` amber — primary CTAs (PLAY / START / SUBMIT), logo plate, active segmented option
- `#ff4d73` coral — streak, "most played", current-question highlights, progress fill
- `#17cf8a` green — success, active toggles, "all regions", mastery stats
- Bean gradient: `radial-gradient(circle at 32% 28%, #7fe8c4, #2bbd8b 60%, #17966a)`
- `#0ea86c` — green for small stat text (accuracy)

Rule of thumb: **muted stage, hot accents.** Accents never tint the background; the background never competes with a CTA.

## Typography

- Display / headings / buttons: **Archivo Black** — always uppercase, letter-spacing 0.01–0.06em
- Body / UI: **Space Grotesk** 400–700
- Micro-labels (kickers, stat labels): 10–11px, 700, uppercase, letter-spacing 0.14em, color `#7d87a8`
- Big hero headline gets a text-shadow: `3px 3px 0 #14182b`

## Core construction rules

1. **Borders:** 2–2.5px solid. Ink (`#14182b`) for neutral elements; a saturated accent for feature cards (each mode card owns one accent: Map ID = green, Quiz = coral, Puzzle = amber).
2. **Hard offset shadows, never blur:**
   - Neutral elements: `2px 2px 0 #14182b` (small) or `3px 3px 0` / `4px 4px 0` (CTAs, panels)
   - Accent-bordered cards: color-cast shadow at 45% alpha, e.g. `5px 5px 0 rgba(23,207,138,0.45)`
3. **Tilt:** feature cards and the logo plate rotate between −1.5° and +1°. Alternate directions across siblings. Never tilt inputs or text blocks inside a card.
4. **Radii:** 9–11px buttons/controls, 14–16px cards, 999px pills.
5. **Badges** ("MOST PLAYED", streak): pill, accent bg, 2px ink border, 2px offset shadow, slight rotation, overlapping the card edge (`top: -12px`).

## Components

- **Logo plate:** bean + "GEOBEAN" (Archivo Black) on an amber plate, 2.5px ink border, 3px shadow, rotated −1.2°. This is the brand lockup everywhere, including in-game.
- **Primary button:** amber bg, ink text, 2px ink border, 3px ink shadow, Archivo Black. On press: translate 2px right/down and drop the shadow.
- **Secondary button:** white bg, ink border, 2px shadow (e.g. SKIP, Stats).
- **Toggle:** 38×22 pill; ON = green fill + ink border, knob right; OFF = `#dcd7c8` fill + `#c9c4b4` border.
- **Segmented control:** white pill container with ink border + shadow; active segment = amber with its own ink border.
- **Region chips:** "ALL REGIONS" = green filled w/ shadow; individual regions = white with coral border.
- **HUD (in-game):** one compact paper strip, ink border + 2px shadow; values bold, labels micro-caps; accuracy green, streak coral.
- **Question bar (map play):** bottom-floating paper bar, amber border, amber color-cast shadow, −0.4° tilt; coral progress fill on a 5px track; target country name in coral.
- **Quiz card:** centered paper card, coral border + coral shadow, −0.5° tilt; flag gets `filter: drop-shadow(4px 4px 0 rgba(20,24,43,0.25))`.

## Layout & sizing

- Desktop canvas 1280×800; mobile 390×844.
- Mobile tap targets ≥ 44px.
- Footer utility actions (Export / Import / Reset) are quiet text links in `#7d87a8` — never buttons.
- Stats in footers highlight only the value in an accent color, label stays muted.

## Don'ts

- No gradients (except the bean), no blurred shadows, no thin/gray borders on interactive elements.
- Don't add more accent colors; don't use accents for large fills or backgrounds.
- Don't tilt more than ±1.5°, and never tilt two adjacent cards the same way.
- Don't lowercase Archivo Black headings.

