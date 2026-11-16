# Test fixtures

`product-procurement/` is a verbatim snapshot of the FM model source at
`libs/evidence-api/tests/fixtures/full-lifecycle/fm` (schema v5, 商品采购协议
full lifecycle): `model.json` plus the `entities/`, `relationships/` and
`rules/` trees. These fixtures cover the model source only. Legacy validation
files have been removed; executable acceptance examples live in
`examples/b2b-escrow/`.

The tree is copied instead of referenced so that schema and model-core tests
stay stable when the API fixture evolves.

Rules for this directory:

- keep the on-disk layout identical to a real `.evidence/fm/` tree;
- never hand-edit a fixture to make a test pass — mutate a clone inside the
  test instead;
- refresh deliberately, with the source skill's own checks passing first.
