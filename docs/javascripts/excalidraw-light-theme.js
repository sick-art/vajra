/**
 * Force all excalidraw-renderer elements to always use the light theme,
 * regardless of the active Material for MkDocs color scheme.
 *
 * How the bundle detects the theme:
 *   The mkdocs-excalidraw-renderer bundle watches document.body for changes
 *   to the `data-md-color-media` attribute (set by Material theme) and maps:
 *     "(prefers-color-scheme: light)"  →  light
 *     anything else                    →  dark
 *
 * Fix:
 *   1. Patch Element.prototype.getAttribute so that any read of
 *      `data-md-color-media` on document.body always returns the light
 *      sentinel. The real DOM attribute is never modified, so the Material
 *      palette toggle (dark/light) continues to work normally for everything
 *      else on the page.
 *   2. After patching, force a re-render of any diagrams that were already
 *      connected and themed before this script ran.
 */
(function () {
  'use strict';

  var _orig = Element.prototype.getAttribute;

  Element.prototype.getAttribute = function (name) {
    if (name === 'data-md-color-media' && this === document.body) {
      var real = _orig.call(this, name);
      // Only override when the attribute is actually present (i.e. on a
      // Material for MkDocs page that has palette switching enabled).
      return real !== null ? '(prefers-color-scheme: light)' : real;
    }
    return _orig.call(this, name);
  };

  // Re-render any diagrams that were already connected and themed before
  // this script loaded (e.g. if Material's JS ran first and set the dark
  // theme before our patch was in place).
  function rerender() {
    document.querySelectorAll('excalidraw-renderer').forEach(function (el) {
      if (typeof el.connectedCallback === 'function') {
        el.connectedCallback();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rerender);
  } else {
    rerender();
  }
})();
