# Rules test suite

The rules tests use a deterministic TypeScript runner rather than a test framework.

- `core/` contains engine setup, turn flow, movement, combat, visibility, pending-roll, snapshot, and architecture-boundary coverage.
- `heroes/` contains hero-specific behavior tests.
- `helpers/testUtils.ts` contains shared state builders, fixtures, RNG stubs, action helpers, and assertions extracted from the former monolithic suite.
- `index.ts` imports every test and preserves the historical execution order.

To add a hero test, place it in the matching `heroes/<hero>.test.ts` file, export the test function, import it in `index.ts`, and add its call to `main()`. Keep boundary checks in `core/boundaries.test.ts` and `mainBoundaries()`.

Run the full gameplay suite with `npm run -w rules test`. Run only architecture boundaries with `npm run -w rules test:boundaries`.
