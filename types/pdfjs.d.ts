// pdf.js is served from /public/pdfjs and loaded at runtime via a native
// browser dynamic import (webpackIgnore). This makes TS treat those imports
// as `any` instead of failing to resolve the absolute URL module.
declare module '*.mjs' {
  const value: any;
  export default value;
}
