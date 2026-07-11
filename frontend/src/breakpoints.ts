/** Responsive breakpoints — mirrors the breakpoint comment block at the top
 *  of index.css's :root. Keep the two in sync: CSS media queries can't read
 *  custom properties, so the values are documented there and exported here
 *  for the TSX side (hooks/useMediaQuery.ts).
 *
 *  - phone  (640): phone tier — column drops, chart simplification, no Hero3D
 *  - nav    (840): navbar drawer replaces the inline row; .view__header collapse
 *  - tablet (900): the long-standing main collapse tier (grids → 1 col)
 */
export const BP = { phone: 640, nav: 840, tablet: 900 } as const;

export const PHONE_QUERY = `(max-width: ${BP.phone}px)`;
export const NAV_QUERY = `(max-width: ${BP.nav}px)`;
