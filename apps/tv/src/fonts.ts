/**
 * Bundled serif families, matching the web theme (Fraunces for display,
 * Spectral for body — see apps/web/app/globals.css --font-display / --font-body).
 * The TTFs live in apps/tv/assets/fonts and are registered via the Info.plist
 * UIAppFonts list (wired by `npx react-native-asset`, config in
 * react-native.config.js). Reference these constants for `fontFamily` in
 * StyleSheets and for Skia's matchFont so a single edit switches the whole app.
 *
 * The family strings are the fonts' internal name-table family names, which is
 * what the platform font manager resolves against — not the filenames. Fraunces
 * ships two static cuts (Regular / SemiBold); Spectral's weights register as
 * separate families the way Google Fonts names them.
 */
export const fonts = {
  display: "Fraunces", // headings, prompts, titles (regular cut)
  displaySemi: "Fraunces SemiBold", // emphasised headings / big numbers
  body: "Spectral", // body copy, labels
  bodyMedium: "Spectral Medium",
  bodySemi: "Spectral SemiBold",
} as const;
