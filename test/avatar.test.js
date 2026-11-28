import test from "node:test";
import assert from "node:assert/strict";
import { getInitials } from "../public/js/components/avatar.js";

test("avatar initials stay uppercase and never exceed two characters", () => {
  assert.equal(getInitials("Ayush Giri"), "AG");
  assert.equal(getInitials("Mary Moore"), "MM");
  assert.equal(getInitials("W"), "W");
  assert.equal(getInitials("A Very Long Developer Name"), "AV");
  assert.equal(getInitials("LongSingleWord"), "L");
  assert.equal(getInitials("   "), "S");
});
