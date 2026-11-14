# desktop-ui-kit

Presentational primitives shared by the desktop renderer and its feature
libraries: the `react-resizable-panels` wrappers, the `cn` class-name helper and
the workspace view-mode control.

It holds no domain logic and imports no Evidence library, so any React surface
can compose it without pulling the model engine in.
