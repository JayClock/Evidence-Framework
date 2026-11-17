import { createSegmentAllocator, pluralSegmentOf } from './segments.js';

it('pluralizes business nouns without substituting metamodel categories', () => {
  expect(
    [
      'rfp.product-inquiry',
      'request.delivery',
      'contract.product-procurement',
      'thing.product',
    ].map(pluralSegmentOf),
  ).toEqual([
    'product-inquiries',
    'deliveries',
    'product-procurements',
    'products',
  ]);
});

it('disambiguates roots across categories, deterministically and independently of unrelated entities', () => {
  const ids = ['contract.purchase', 'rfp.purchase', 'thing.product'];
  const before = createSegmentAllocator(ids, pluralSegmentOf);
  const after = createSegmentAllocator(
    ['role.purchase', ...[...ids].reverse()],
    pluralSegmentOf,
  );
  expect(before.segmentOf('contract.purchase')).not.toBe(
    before.segmentOf('rfp.purchase'),
  );
  for (const id of ids.slice(0, 2))
    expect(after.segmentOf(id)).toBe(before.segmentOf(id));
  expect(before.segmentOf('thing.product')).toBe('products');
});
