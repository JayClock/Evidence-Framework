# desktop-feature-inspector

The right-hand inspector the studio opens on a selected entity: the attribute
grid, the CEL editor and formula bar, the derived-rule and fulfillment-pair
sections, and the key-data ledger studio with its provenance picker.

It renders and edits a `DomainModelDocument` through the model session API; it
holds no IPC and no window state, so a web review surface can reuse it with the
same props the desktop passes today.
