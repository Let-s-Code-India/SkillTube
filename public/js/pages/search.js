import { call } from "../api.js";
import { showError } from "../errors.js";
import { listingCard } from "../components/cards.js";

export async function render(app) {
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search AI resources or @username";
  input.setAttribute("aria-label", "Search");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn";
  submit.textContent = "Search";
  form.append(input, submit);
  const results = document.createElement("div");
  results.className = "listing-grid";
  form.addEventListener("submit", async (event) => {
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
  });
  app.append(form, results);
}
