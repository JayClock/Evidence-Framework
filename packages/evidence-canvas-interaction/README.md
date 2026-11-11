# evidence-canvas-interaction

Framework-free maths for the desktop modeling canvas: viewport transforms and
ruler ticks, unit tested without React or the DOM.

| Module       | Responsibility                                                                    |
| ------------ | --------------------------------------------------------------------------------- |
| `viewport/`  | `world * zoom + pan` transforms, anchor-preserving zoom, zoom-to-fit.             |
| `ruler/`     | 1-2-5 step ladder and grid-aligned major/minor ticks for both axes.               |
| `layout/`    | Turns a `DomainGraph` into placed Context cards, Fulfillment pairs, nodes, edges. |
| `selection/` | One-hop highlight sets, marquee intersection and pointer hit testing.             |

```bash
nx test evidence-canvas-interaction
nx build evidence-canvas-interaction
```
