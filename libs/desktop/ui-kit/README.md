# desktop-ui-kit

Presentational primitives shared by the desktop renderer and its feature
libraries: the `react-resizable-panels` wrappers, the `cn` class-name helper, the
workspace view-mode control and the design-system layer (button, badge, key cap,
dialog, sheet, popover, tooltip, command palette, toast).

It holds no domain logic and imports no Evidence library, so any React surface
can compose it without pulling the model engine in.

## The design-system layer

The components follow the shadcn/ui model: the source lives here, compiled by
this project's build like any other library file, rather than arriving as a
black-box runtime dependency. `components.json` exists so the CLI can still add a
component from the registry:

```bash
pnpm dlx shadcn@latest add dialog --cwd libs/desktop/ui-kit
```

Anything the CLI writes is reviewed, renamed to this project's conventions and
compressed to the desktop density below.

### One owner per decision

- **Density.** `controlVariants` in `components/button/Button.tsx` owns the
  height and type scale (`xs` 24px, `sm` 28px, `md` 32px, `icon` 28px). A
  modelling window packs a toolbar, two rails and a console into one screen, so a
  control is shorter than a web form's by default.
- **Colour.** Components ask for a semantic token (`bg-evidence-surface`,
  `text-evidence-muted`, `ring-evidence-ring`), never a hex value. The tokens are
  declared once in the consuming app's `@theme` block
  (`apps/desktop/src/renderer/styles.css`): a library cannot own the Tailwind
  entry point, and duplicating the palette in two files is how they drift.
- **Motion.** `styles.css` declares the `evidence-*` keyframes the overlay
  components name. Tailwind v4 ships no `animate-in` plugin, and an overlay that
  appears without a transition reads as a layout glitch rather than a layer.
- **Icons.** `lucide-react`, the same set the app uses, so a glyph means the same
  thing in a sheet and in the header.

`data-slot` marks every primitive's root so a caller can restyle one element
without a new prop or a `className` guess.

### Content scanning

Tailwind v4 scans from the CSS entry point and stops at the app directory, so the
app's stylesheet names this library in an `@source` rule. A class used only here
and not declared there compiles to nothing; see
`docs/rfc-phase-1-ui-infra-and-command-palette.md` §3.3.

### Testing

`../testing/vitest.setup.ts` installs the two jsdom gaps these primitives need
(`ResizeObserver` for `cmdk`, `scrollIntoView` for its active row).
