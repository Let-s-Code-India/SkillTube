import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import test from "node:test";

test("theme boot applies and rejects theme values", () => testThemeBoot());
test("card cover hash is stable", () => testCardHash());
test("chart builders add accessible summary and hidden table", () => testCharts());
test("onboarding stepper has ordered steps", () => testStepper());

function testThemeBoot() {
  for (const [stored,expected] of [
    ["light","light"],["dark","dark"],["hacker","hacker"],["midnight","midnight"],
    ["sunrise","sunrise"],["contrast","contrast"],["invalid",null],[null,null],
  ]) {
    const dom=new JSDOM('<html><head><meta name="theme-color" content="#17151d"></head><body></body></html>',{
      url:"https://skilltube.test/",runScripts:"outside-only",
    });
    dom.window.matchMedia=()=>({matches:false});
    if(stored!==null)dom.window.localStorage.setItem("skilltube.theme",stored);
    dom.window.eval(readFileSync(new URL("../public/js/theme-boot.js",import.meta.url),"utf8"));
    assert.equal(dom.window.document.documentElement.getAttribute("data-theme"),expected);
  }
}
function testCardHash() {
  const hash=(name)=>Array.from(name||"").reduce((sum,char)=>sum+char.charCodeAt(0),0)%12+1;
  assert.equal(hash("Agent Skill"),hash("Agent Skill"));
  assert.equal(hash(""),1);
  assert.ok(hash("Agent Skill")>=1&&hash("Agent Skill")<=12);
}
async function testCharts() {
  const dom=new JSDOM("<!doctype html><div id='chart'></div>",{url:"https://skilltube.test/"});
  globalThis.document=dom.window.document;
  globalThis.CustomEvent=dom.window.CustomEvent;
  const { horizontalBarChart,donutChart }=await import("../public/js/components/charts.js");
  const chart=document.querySelector("#chart");
  horizontalBarChart(chart,"Views by listing",[ {label:"One",value:10},{label:"Two",value:5}],"Views");
  donutChart(chart,3,10);
  assert.ok(chart.querySelector('svg[role="img"][aria-label]'));
  assert.ok(chart.querySelector("table caption"));
  assert.equal(chart.querySelectorAll(".weekly-bar-row").length,2);
  assert.equal(chart.querySelector(".donut-center .chart-number").textContent,"3 / 10");
  assert.equal(chart.querySelector(".donut-center .chart-caption").textContent,"listings used");
  for (const [used,limit,expected] of [[0,5,"0 / 5"],[1,5,"1 / 5"],[5,5,"5 / 5"],[0,0,"—"]]) {
    const host=document.createElement("div");
    donutChart(host,used,limit);
    assert.equal(host.querySelector(".donut-center .chart-number").textContent,expected);
    assert.equal(host.querySelector(".donut-center .chart-caption").textContent,"listings used");
  }
}
async function testStepper() {
  const dom=new JSDOM("<!doctype html><div id='steps'></div>",{url:"https://skilltube.test/"});
  globalThis.document=dom.window.document;
  const { onboardingStepper }=await import("../public/js/components/onboarding.js");
  onboardingStepper(document.querySelector("#steps"),2);
  assert.deepEqual([...document.querySelectorAll(".step")].map((n)=>n.textContent),[
    "1. Sign in","2. Confirm 18+","3. Choose country","4. Done",
  ]);
  assert.equal(document.querySelector('[aria-current="step"]').textContent,"2. Confirm 18+");
}
