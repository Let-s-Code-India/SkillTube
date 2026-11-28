/*
 * Purpose: Render the search page and coordinate its UI actions.
 * Called by: public/js/app.js for the search route.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import { call } from "../api.js";
import { showError } from "../errors.js";
import { listingCard } from "../components/cards.js";

// Render the search route into its container.
export async function render(app) {
  const form = document.createElement("form");
  form.className = "search-toolbar";
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const initial = params.get("q") || "";
  const input = document.createElement("input");
  input.type = "search";
  input.value = initial;
  input.placeholder = "Search AI resources or @username";
  input.setAttribute("aria-label", "Search");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn";
  submit.textContent = "Search";
  const sort = document.createElement("select");
  sort.setAttribute("aria-label","Sort results");
  for (const [value,label] of [["relevant","Most relevant"],["new","Newest"],["stars","Most starred"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; sort.append(option);
  }
  form.append(input, submit, sort);
  const count = document.createElement("p");
  count.className = "result-count";
  count.setAttribute("aria-live","polite");
  app.append(form, count);
  const results = document.createElement("div");
  results.className = "listing-grid";
  form.addEventListener(
    "submit",
    /* Handle the submit event. */
    async (event) => {
      event.preventDefault();
      results.replaceChildren();
      const loading = document.createElement("div");
      loading.className = "skeleton";
      loading.setAttribute("aria-label", "Searching");
      results.append(loading);
      submit.disabled = true;
      try {
        const result = await call("public_search", {
          p_q: input.value.trim(),
          p_page: 0,
        });
        results.replaceChildren();
        const items = result?.items || (result?.developer?.skills || []);
        count.textContent = `${items.length} ${items.length === 1 ? "result" : "results"}`;
        if (result?.kind === "developer") {
          const developer = result.developer;
          if (!developer) {
            const empty = document.createElement("p");
            empty.className = "mut";
            empty.textContent = "No developer matched that username.";
            results.append(empty);
          } else {
            const heading = document.createElement("h2");
            heading.textContent = `@${developer.username}`;
            const link = document.createElement("a");
            link.href = `#/dev/${encodeURIComponent(developer.username)}`;
            link.textContent = "Open developer channel";
            results.append(heading, link);
            for (const skill of developer.skills || [])
              results.append(listingCard(skill));
          }
        } else {
          const items = result?.items || [];
          if (sort.value === "stars") items.sort((a,b)=>(b.stars||0)-(a.stars||0));
          if (sort.value === "new") items.sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
          if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "mut";
            empty.textContent = "No listings matched your search.";
            results.append(empty);
          }
          for (const skill of items) results.append(listingCard(skill));
        }
      } catch (error) {
        showError(results, error.code, error.arg);
      } finally {
        submit.disabled = false;
      }
    },
  );
  app.append(results);
  if (initial) form.requestSubmit();
}
