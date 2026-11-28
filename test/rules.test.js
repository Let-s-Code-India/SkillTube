import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("badge rule fallbacks use live-rule spans", async () => {
  const source = await readFile("content/docs/badges-and-ranking.md", "utf8");
  assert.match(source, /data-rule="blue_tick_followers">1,000</);
  assert.match(source, /data-rule="master_tick_blue_followers">100</);
  assert.match(source, /data-rule="master_tick_countries">10</);
});
