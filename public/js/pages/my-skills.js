/*
 * Purpose: Render the my listings page and coordinate its UI actions.
 * Called by: public/js/app.js for the my listings route.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import { call, edgeForm } from "../api.js";
import { showError } from "../errors.js";
import { confirmDialog } from "../components/dialogs.js";
import { toast } from "../components/toasts.js";
import { listingCard } from "../components/cards.js";

// Create a labeled input or textarea with its initial value.
function field(labelText, value = "", textarea = false) {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement(textarea ? "textarea" : "input");
  input.value = value;
  if (!textarea) input.type = "text";
  label.append(span, input);
  return { label, input };
}

// Calculate the remaining listing restore period.
function undoRemaining(deletedAt) {
  const deleted = Date.parse(deletedAt || "");
  return Number.isFinite(deleted)
    ? Math.max(0, deleted + 12 * 60 * 60 * 1000 - Date.now())
    : 0;
}

// Format remaining.
function formatRemaining(milliseconds) {
  const minutes = Math.ceil(milliseconds / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Render the my listings route into its container.
export async function render(app) {
  const host = document.createElement("div");
  host.className = "listing-grid";
  app.append(host);
  await loadSkills(host);
}

// Load the author's listings and render the empty or populated state.
async function loadSkills(host) {
  host.replaceChildren();
  const skeleton = document.createElement("div");
  skeleton.className = "skeleton";
  skeleton.setAttribute("aria-label", "Loading your listings");
  host.append(skeleton);
  let skills;
  try {
    skills = await call("my_skills");
  } catch (error) {
    host.replaceChildren();
    showError(host, error.code, error.arg);
    return;
  }
  host.replaceChildren();
  if (!skills.length) {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent = "You have no listings yet.";
    const publish = document.createElement("a");
    publish.className = "btn";
    publish.href = "#/publish";
    publish.textContent = "Publish a listing";
    host.append(empty, publish);
    return;
  }
  for (const skill of skills) host.append(renderSkillCard(host, skill));
}

// Render one listing with its available management actions.
function renderSkillCard(host, skill) {
  const card = listingCard(skill);
  const status = document.createElement("p");
  status.className = "listing-management-status";
  status.textContent = skill.deleted_at
    ? `Deleted · ${undoRemaining(skill.deleted_at) ? `undo available for ${formatRemaining(undoRemaining(skill.deleted_at))}` : "undo period ended"}`
    : `${skill.status} · edit lock: ${skill.edit_days_left || 0} days · ${Number(skill.downloads || 0).toLocaleString()} source opens`;
  const actions = document.createElement("div");
  actions.className = "admin-actions listing-management-actions";
  const content = card.querySelector(".listing-card-content");
  content.append(status, actions);

  if (skill.deleted_at) {
    if (undoRemaining(skill.deleted_at) > 0) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "btn secondary";
      restore.textContent = "Undo delete";
      const error = document.createElement("div");
      restore.addEventListener(
        "click",
        /* Handle the click event. */
        async () => {
          restore.disabled = true;
          try {
            await call("restore_skill", { p_skill: skill.id });
            toast("Listing restored.");
            await loadSkills(host);
          } catch (e) {
            showError(error, e.code, e.arg);
          } finally {
            restore.disabled = false;
          }
        },
      );
      actions.append(restore);
      content.append(error);
    }
    return card;
  }

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "btn secondary";
  edit.textContent = "Edit";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn danger";
  remove.textContent = "Delete";
  const image = document.createElement("button");
  image.type = "button";
  image.className = "btn secondary";
  image.textContent = "Change image";
  const update = document.createElement("button");
  update.type = "button";
  update.className = "btn secondary";
  update.textContent = "I released a new version";
  actions.append(edit, remove, image, update);

  edit.addEventListener(
    "click",
    /* Handle the click event. */
    () => openEdit(card, skill),
  );
  remove.addEventListener(
    "click",
    /* Handle the click event. */
    () => deleteSkill(host, card, skill),
  );
  image.addEventListener(
    "click",
    /* Handle the click event. */
    () => openImage(card, skill),
  );
  update.addEventListener(
    "click",
    /* Handle the click event. */
    () => openVersionForm(card, skill),
  );
  return card;
}

// Edit listing descriptions and image positioning.
function openEdit(card, skill) {
  const old = card.querySelector(".edit-panel");
  if (old) old.remove();
  const panel = document.createElement("form");
  panel.className = "edit-panel";
  const short = field("Short description", skill.short_desc);
  short.input.maxLength = 150;
  const long = field("Long description", skill.long_desc, true);
  long.input.maxLength = 1500;
  const zoom = field("Image zoom", "" + (skill.image?.zoom || 1));
  zoom.input.type = "number";
  zoom.input.min = "1";
  zoom.input.max = "4";
  zoom.input.step = "0.1";
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "btn";
  submit.textContent = "Save";
  panel.append(short.label, long.label, zoom.label, submit);
  card.append(panel);
  submit.addEventListener(
    "click",
    /* Handle the click event. */
    async () => {
      if (
        short.input.value.length < 10 ||
        short.input.value.length > 150 ||
        long.input.value.length < 30 ||
        long.input.value.length > 1500
      ) {
        showError(panel, "BAD_SHORT");
        return;
      }
      submit.disabled = true;
      try {
        await call("edit_skill", {
          p_skill: skill.id,
          p_short: short.input.value,
          p_long: long.input.value,
          p_tags: null,
          p_zoom: Number(zoom.input.value),
          p_x: skill.image?.x || 0,
          p_y: skill.image?.y || 0,
        });
        toast("Listing updated.");
        location.reload();
      } catch (error) {
        showError(panel, error.code, error.arg);
        submit.disabled = false;
      }
    },
  );
}

// Delete a listing after confirmation; backend rules control restoration.
async function deleteSkill(host, card, skill) {
  if (
    !confirmDialog(`Delete "${skill.name}"? You can undo this within 12 hours.`)
  )
    return;
  try {
    await call("delete_skill", { p_skill: skill.id });
    skill.deleted_at = new Date().toISOString();
    card.replaceWith(renderSkillCard(host, skill));
    toast("Listing deleted. You can undo this within 12 hours.");
  } catch (error) {
    showError(card, error.code, error.arg);
  }
}

// Share a new-version update with the listing's followers.
function openVersionForm(card, skill) {
  const old = card.querySelector(".version-panel");
  if (old) old.remove();
  const form = document.createElement("form");
  form.className = "version-panel";
  const label = document.createElement("label");
  label.textContent = "What changed? (optional, up to 140 characters)";
  const note = document.createElement("textarea");
  note.maxLength = 140;
  const error = document.createElement("div");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn";
  submit.textContent = "Announce version";
  label.append(note);
  form.append(label, error, submit);
  card.append(form);
  form.addEventListener(
    "submit",
    /* Handle the submit event. */
    async (event) => {
      event.preventDefault();
      if (Array.from(note.value).length > 140) {
        showError(error, "BAD_LENGTH", "140");
        return;
      }
      submit.disabled = true;
      try {
        await call("announce_update", {
          p_skill: skill.id,
          p_note: note.value.trim() || null,
        });
        toast("Version update shared with your followers.");
        form.remove();
      } catch (e) {
        showError(error, e.code, e.arg);
      } finally {
        submit.disabled = false;
      }
    },
  );
}

// Validate and upload a replacement listing image.
function openImage(card, skill) {
  const old = card.querySelector(".image-panel");
  if (old) old.remove();
  const panel = document.createElement("form");
  panel.className = "image-panel";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/svg+xml,image/png";
  const help = document.createElement("p");
  help.className = "mut";
  help.textContent = "SVG or an allowed PNG.";
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "btn";
  upload.textContent = "Upload";
  panel.append(help, input, upload);
  card.append(panel);
  upload.addEventListener(
    "click",
    /* Handle the click event. */
    async () => {
      const file = input.files?.[0];
      if (!file) {
        showError(panel, "BAD_IMAGE");
        return;
      }
      let rules;
      try {
        rules = (await call("me_state"))?.image_rules;
      } catch (error) {
        showError(panel, error.code, error.arg);
        return;
      }
      const maxBytes = rules?.skill_max_bytes || 3072;
      if (file.size > maxBytes) {
        showError(panel, "FILE_TOO_BIG", String(maxBytes));
        return;
      }
      if (file.type === "image/png" && !rules?.skill_png) {
        showError(panel, "PNG_NOT_ALLOWED");
        return;
      }
      if (file.type !== "image/png" && file.type !== "image/svg+xml") {
        showError(panel, "BAD_IMAGE");
        return;
      }
      const form = new FormData();
      form.append("action", "upload");
      form.append("target", "skill");
      form.append("skill_id", skill.id);
      form.append("file", file, file.name);
      upload.disabled = true;
      try {
        await edgeForm("save-image", form);
        toast("Listing image updated.");
        location.reload();
      } catch (error) {
        showError(panel, error.code, error.arg);
        upload.disabled = false;
      }
    },
  );
}
