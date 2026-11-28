import test from "node:test";
import assert from "node:assert/strict";
import { routeParts } from "../public/js/router.js";

test("route parsing ignores query parameters when resolving route modules", () => {
  assert.deepEqual(routeParts("search?q=web-frontend&topic=web-frontend"), ["search", ""]);
  assert.deepEqual(routeParts("skill/demo-skill?ref=chip"), ["skill", "demo-skill"]);
});
