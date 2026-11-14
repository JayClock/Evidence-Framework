# desktop-feature-canvas

The React canvas the desktop studio renders a model onto: the viewport, node
cards, ruler, legend, lifecycle banner and diagnostic markers, plus the small
pieces they share — the edge/label geometry, the category colours, the card
summary and the sensor-to-node diagnostic index.

It owns no IPC and no window state. The app hands it a `DomainModelDocument`
and a `DiagnosticIndex`, and provides live delivery routes through
`LiveApiProvider`; the library only draws them.
