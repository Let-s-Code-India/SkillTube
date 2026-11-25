import { edge } from "../api.js";
import { showError } from "../errors.js";

const countryCodes = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`;
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes
  .trim()
  .split(/\s+/)
  .map((code) => ({ code, name: displayNames.of(code) }))
  .filter((country) => country.name);

export function renderCountryPicker(app, onComplete) {
  app.replaceChildren();
  const section = document.createElement("section");
  section.className = "country-gate";
  section.setAttribute("aria-labelledby", "country-gate-title");
  const heading = document.createElement("h2");
  heading.id = "country-gate-title";
  heading.textContent = "Choose your country";
  const explanation = document.createElement("p");
  explanation.textContent =
    "This private account setting is used for account setup. It is not shown on your public channel.";
  const search = document.createElement("input");
  search.type = "search";
  search.setAttribute("aria-label", "Search countries");
  search.placeholder = "Search by country name or code";
  const select = document.createElement("select");
  select.size = 9;
  select.setAttribute("aria-label", "Countries");
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "Select a country";
  option.selected = true;
  select.append(option);
  const error = document.createElement("div");
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "btn";
  submit.textContent = "Continue";
  submit.disabled = true;

  function populate(query = "") {
    const term = query.trim().toLowerCase();
    const selected = select.value;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a country";
    select.append(placeholder);
    for (const country of countries) {
      if (
        term &&
        !country.name.toLowerCase().includes(term) &&
        !country.code.toLowerCase().includes(term)
      )
        continue;
      const item = document.createElement("option");
      item.value = country.code;
      item.textContent = `${country.name} (${country.code})`;
      select.append(item);
    }
    select.value = selected;
    submit.disabled = !select.value;
  }
  populate();
  search.addEventListener("input", () => populate(search.value));
  select.addEventListener("change", () => {
    submit.disabled = !select.value;
  });
  submit.addEventListener("click", async () => {
    if (!select.value) return;
    submit.disabled = true;
    try {
      await edge("set-country", { country: select.value });
      onComplete();
    } catch (e) {
      showError(error, e.code, e.arg);
      submit.disabled = false;
    }
  });
  section.append(heading, explanation, search, select, error, submit);
  app.append(section);
}
