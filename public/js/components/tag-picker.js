/*
 * Purpose: Provide reusable tag picker UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
export function tagPicker(labelText, choices, count) {
  const field = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = labelText;
  const selected = new Set();
  choices.forEach(
    /* Process each choice in the collection. */
    (choice) => {
      const label = document.createElement("label");
      label.className = "chip";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = choice;
      input.addEventListener(
        "change",
        /* Handle the change event. */
        () => {
          if (input.checked && selected.size >= count) {
            input.checked = false;
            return;
          }
          input.checked ? selected.add(choice) : selected.delete(choice);
        },
      );
      label.append(input, document.createTextNode(choice));
      field.append(label);
    },
  );
  field.prepend(legend);
  field.value =
    /* Expose the current selection to the caller. */
    () => [...selected];
  return field;
}
