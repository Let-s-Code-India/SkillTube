/*
 * Purpose: Provide reusable report dialog UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
import { call } from "../api.js";
import { showError } from "../errors.js";
import { toast } from "./toasts.js";

const reasons = [
  ["malware", "Malware"],
  ["hacking_tool", "Hacking or credential theft"],
  ["illegal", "Illegal content"],
  ["violence_terror", "Violence or terrorism"],
  ["copyright", "Copyright"],
  ["spam_fake", "Spam or misleading content"],
  ["other", "Other"],
];

// Create a report button bound to the current content item.
export function reportButton(target) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn secondary";
  button.textContent =
    target.kind === "skill" ? "Report listing" : "Report channel";
  button.addEventListener(
    "click",
    /* Handle the click event. */
    () => openReportDialog(target),
  );
  return button;
}

// Open report dialog.
function openReportDialog(target) {
  const dialog = document.createElement("dialog");
  dialog.className = "report-dialog";
  const form = document.createElement("form");
  form.method = "dialog";
  const heading = document.createElement("h2");
  heading.textContent =
    target.kind === "skill" ? "Report this listing" : "Report this channel";
  const privacy = document.createElement("p");
  privacy.className = "mut";
  privacy.textContent = "The developer will not see who reported them.";
  const reasonLabel = document.createElement("label");
  reasonLabel.textContent = "Reason";
  const select = document.createElement("select");
  select.required = true;
  for (const [value, labelText] of reasons) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelText;
    select.append(option);
  }
  reasonLabel.append(select);
  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Note (optional, up to 150 characters)";
  const note = document.createElement("textarea");
  note.maxLength = 150;
  noteLabel.append(note);
  const error = document.createElement("div");
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn secondary";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn danger";
  submit.textContent = "Send report";
  actions.append(cancel, submit);
  form.append(heading, privacy, reasonLabel, noteLabel, error, actions);
  dialog.append(form);
  document.body.append(dialog);
  cancel.addEventListener(
    "click",
    /* Handle the click event. */
    () => dialog.close(),
  );
  dialog.addEventListener(
    "close",
    /* Handle the close event. */
    () => dialog.remove(),
    { once: true },
  );
  form.addEventListener(
    "submit",
    /* Handle the submit event. */
    async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        if (target.kind === "skill")
          await call("file_report", {
            p_skill: target.id,
            p_channel: null,
            p_reason: select.value,
            p_note: note.value.trim() || null,
          });
        else
          await call("file_report_channel_by_username", {
            p_username: target.username,
            p_reason: select.value,
            p_note: note.value.trim() || null,
          });
        dialog.close();
        toast("Report sent. The developer's identity remains private.");
      } catch (e) {
        showError(error, e.code, e.arg);
      } finally {
        submit.disabled = false;
      }
    },
  );
  dialog.showModal();
}
