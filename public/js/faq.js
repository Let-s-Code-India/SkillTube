/*
 * Purpose: Provide search and filtering for the static FAQ page.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
const input = document.querySelector("#faq-search");
const count = document.querySelector("#faq-count");
const empty = document.querySelector("#faq-empty");
const items = [...document.querySelectorAll(".faq-item")];
const groups = [...document.querySelectorAll(".faq-group")];

input.addEventListener(
  "input",
  /* Handle the input event. */
  () => {
    const query = input.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const item of items) {
      item.hidden =
        query !== "" && !item.textContent.toLocaleLowerCase().includes(query);
      if (!item.hidden) visible++;
    }
    for (const group of groups)
      group.hidden = !group.querySelector(".faq-item:not([hidden])");
    count.textContent = `${visible} question${visible === 1 ? "" : "s"}`;
    empty.hidden = visible !== 0;
  },
);
