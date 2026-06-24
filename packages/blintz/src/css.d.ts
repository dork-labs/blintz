// Allow side-effect CSS imports (`import "./theme/index.css"`) under tsc.
// Vite/the bundler turns these into real stylesheet loads; tsc only needs the
// module to resolve.
declare module "*.css";
