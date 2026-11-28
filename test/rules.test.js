import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("badge rule fallbacks remain when rules are missing and update when supplied", async () => {
  const dom = new JSDOM(
    '<p><span data-rule="blue_tick_followers">1,000</span>|<span data-rule="master_tick_blue_followers">100</span>|<span data-rule="master_tick_countries">10</span></p>',
    { url: "https://skilltube.test/" },
  );
  let response = { blue_tick_followers: 1000 };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  dom.window.supabase = {
    createClient: () => ({
      rpc: async (name) => {
        assert.equal(name, "public_settings");
        return { data: response, error: null };
      },
    }),
  };

  try {
    const { applyLiveRules } = await import("../public/js/rules.js");
    await applyLiveRules(dom.window.document);
    assert.deepEqual(
      [...dom.window.document.querySelectorAll("[data-rule]")].map((node) => node.textContent),
      ["1,000", "100", "10"],
      "missing keys preserve their static fallback text",
    );

    dom.window.sessionStorage.clear();
    response = {
      blue_tick_followers: 2500,
      master_tick_blue_followers: 125,
      master_tick_countries: 12,
    };
    await applyLiveRules(dom.window.document);
    assert.deepEqual(
      [...dom.window.document.querySelectorAll("[data-rule]")].map((node) => node.textContent),
      ["2,500", "125", "12"],
      "available admin values replace the static fallbacks",
    );
  } finally {
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.sessionStorage;
  }
});

test("public badge copy keeps the requested crawlable fallbacks", async () => {
  const [faq, llms] = await Promise.all([
    readFile("public/faq/index.html", "utf8"),
    readFile("public/llms-source.json", "utf8"),
  ]);
  const docs = await readFile("public/docs/badges-and-ranking/index.html", "utf8");
  assert.match(faq, /<script src="\/vendor\/supabase\.min\.js"><\/script>/);
  assert.match(docs, /<script src="\/vendor\/supabase\.min\.js"><\/script>/);
  assert.match(faq, /data-rule="blue_tick_followers">1,000</);
  assert.match(faq, /data-rule="master_tick_blue_followers">100</);
  assert.match(faq, /data-rule="master_tick_countries">10</);
  const source = JSON.parse(llms);
  assert.match(source.faq.find((item) => item.question === "What is the Blue Tick?").answer, /^1,000 followers/);
  assert.match(source.faq.find((item) => item.question === "What is the Master Tick?").answer, /^100 Blue-Tick followers from at least 10 countries/);
});
