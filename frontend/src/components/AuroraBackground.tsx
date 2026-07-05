/** The page-wide aurora: one fixed layer mounted once in the shell, behind
 *  all content. Three oversized blurred blobs colored by the active theme's
 *  accent/driver vars, drifting on transform-only keyframes (styles in
 *  index.css; reduced-motion turns the drift off). Never per-card blobs —
 *  every glass surface frosts THIS layer. */
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora__blob aurora__blob--a" />
      <div className="aurora__blob aurora__blob--b" />
      <div className="aurora__blob aurora__blob--c" />
    </div>
  );
}
