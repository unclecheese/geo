// RN's base tsconfig lib omits the `performance` global that
// @geobean/core's stores reference (`typeof performance !== "undefined"`).
// Hermes provides it at runtime; this just satisfies the typechecker.
declare var performance: { now(): number };
