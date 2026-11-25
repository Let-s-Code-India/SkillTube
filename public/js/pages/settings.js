import { call, edge, edgeForm } from "../api.js";
import { signOut } from "../auth.js";
import { showError } from "../errors.js";
import { toast } from "../components/toasts.js";

const topics = [
  "programming",
  "web-frontend",
  "backend-api",
  "mobile-desktop",
  "ai-agents",
  "data-db",
  "devops-cloud",
  "security",
  "automation",
  "writing",
  "documents",
  "design",
  "research",
  "business",
  "education",
];

function node(tag, text, className = "") {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function section(title) {
  const element = node("section", undefined, "card settings-section");
  element.append(node("h2", title));
  return element;
}

export async function render(app) {
  let profile;
  try {
    profile = await call("me_state");
  } catch (error) {
    showError(app, error.code, error.arg);
    return;
  }

  const profileSection = section("Profile");
  const profileForm = document.createElement("form");
  const bioLabel = node("label", "Bio (up to 150 characters)");
  const bio = document.createElement("textarea");
  bio.maxLength = 150;
  bio.value = profile?.bio || "";
  bioLabel.append(bio);
  const tagsLabel = node(
    "label",
    "Your profile tags (up to five, comma-separated)",
  );
  const tags = document.createElement("input");
  tags.type = "text";
  tags.value = (profile?.self_tags || []).join(", ");
  tagsLabel.append(tags);
  const saveProfile = node("button", "Save profile", "btn");
  saveProfile.type = "submit";
  const profileError = node("div");
  profileForm.append(bioLabel, tagsLabel, profileError, saveProfile);
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (Array.from(bio.value).length > 150) {
      showError(profileError, "BAD_LENGTH", "150");
      return;
    }
    const selfTags = tags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (selfTags.length > 5) {
      showError(profileError, "TOO_MANY_TAGS");
      return;
    }
    saveProfile.disabled = true;
    try {
      await call("update_my_profile", {
        p_name: profile.name || null,
        p_bio: bio.value,
        p_self_tags: selfTags,
        p_zoom: null,
        p_x: null,
        p_y: null,
      });
      toast("Profile saved.");
    } catch (error) {
      showError(profileError, error.code, error.arg);
    } finally {
      saveProfile.disabled = false;
    }
  });
  profileSection.append(profileForm);

  const interestsSection = section("Interests");
  interestsSection.append(
    node(
      "p",
      "Choose three topics to personalize recommendations. Your saved choices are private.",
    ),
  );
  const interests = document.createElement("fieldset");
  const legend = node("legend", "Choose exactly three");
  interests.append(legend);
  const selected = new Set();
  for (const topic of topics) {
    const label = node("label", undefined, "chip");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = topic;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked && selected.size >= 3) {
        checkbox.checked = false;
        showError(interestError, "PICK_THREE_TOPICS");
        return;
      }
      if (checkbox.checked) selected.add(topic);
      else selected.delete(topic);
    });
    label.append(checkbox, document.createTextNode(topic));
    interests.append(label);
  }
  const interestError = node("div");
  const saveInterests = node("button", "Save interests", "btn");
  saveInterests.type = "button";
  const clearInterests = node("button", "Clear interests", "btn secondary");
  clearInterests.type = "button";
  saveInterests.addEventListener("click", async () => {
    if (selected.size !== 3) {
      showError(interestError, "PICK_THREE_TOPICS");
      return;
    }
    saveInterests.disabled = true;
    try {
      await call("set_interests", { p_topics: [...selected] });
      toast("Interests saved.");
    } catch (error) {
      showError(interestError, error.code, error.arg);
    } finally {
      saveInterests.disabled = false;
    }
  });
  clearInterests.addEventListener("click", async () => {
    clearInterests.disabled = true;
    try {
      await call("clear_interests");
      selected.clear();
      interests.querySelectorAll("input[type=checkbox]").forEach((checkbox) => {
        checkbox.checked = false;
      });
      toast("Interests cleared.");
    } catch (error) {
      showError(interestError, error.code, error.arg);
    } finally {
      clearInterests.disabled = false;
    }
  });
  interestsSection.append(
    interests,
    interestError,
    saveInterests,
    clearInterests,
  );

  const privacySection = section("Privacy");
  const hideLabel = node("label", "Hide my channel from public pages");
  const hide = document.createElement("input");
  hide.type = "checkbox";
  hide.checked = profile?.hide_public === true;
  hideLabel.prepend(hide);
  const hideError = node("div");
  hide.addEventListener("change", async () => {
    hide.disabled = true;
    try {
      await call("set_hide_public", { p_hide: hide.checked });
      toast(
        hide.checked
          ? "Your channel is hidden from public pages."
          : "Your channel is visible on public pages.",
      );
    } catch (error) {
      hide.checked = !hide.checked;
      showError(hideError, error.code, error.arg);
    } finally {
      hide.disabled = false;
    }
  });
  privacySection.append(hideLabel, hideError);

  const imageSection = section("Profile image");
  const help = node(
    "p",
    "Profile image: SVG, or PNG for Blue/Master Tick accounts.",
    "mut",
  );
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/svg+xml,image/png";
  const upload = node("button", "Upload image", "btn");
  upload.type = "button";
  const imageError = node("div");
  upload.addEventListener("click", async () => {
    const file = imageInput.files?.[0];
    if (!file) {
      showError(imageError, "BAD_IMAGE");
      return;
    }
    const rules = profile?.image_rules || {};
    const maxBytes = rules.logo_max_bytes || 3072;
    if (file.size > maxBytes) {
      showError(imageError, "FILE_TOO_BIG", String(maxBytes));
      return;
    }
    if (file.type === "image/png" && !rules.logo_png) {
      showError(imageError, "PNG_NOT_ALLOWED");
      return;
    }
    if (file.type !== "image/png" && file.type !== "image/svg+xml") {
      showError(imageError, "BAD_IMAGE");
      return;
    }
    const form = new FormData();
    form.append("action", "upload");
    form.append("target", "profile");
    form.append("file", file, file.name);
    upload.disabled = true;
    try {
      await edgeForm("save-image", form);
      toast("Profile image updated.");
    } catch (error) {
      showError(imageError, error.code, error.arg);
    } finally {
      upload.disabled = false;
    }
  });
  imageSection.append(help, imageInput, upload, imageError);

  const countrySection = section("Private country");
  const countryLabel = node("label", "Country code");
  const country = document.createElement("input");
  country.type = "text";
  country.maxLength = 2;
  country.value = profile?.country || "";
  countryLabel.append(country);
  const countryError = node("div");
  const countryButton = node("button", "Save country", "btn");
  countryButton.type = "button";
  if (profile?.country_days_left > 0) {
    country.disabled = true;
    countryButton.disabled = true;
    countrySection.append(
      node(
        "p",
        `Country changes are locked for ${profile.country_days_left} days.`,
        "mut",
      ),
    );
  }
  countryButton.addEventListener("click", async () => {
    countryButton.disabled = true;
    try {
      await edge("set-country", {
        country: country.value.trim().toUpperCase(),
      });
      toast("Country saved.");
    } catch (error) {
      showError(countryError, error.code, error.arg);
      countryButton.disabled = false;
    }
  });
  countrySection.append(countryLabel, countryButton, countryError);

  const shortcutSection = section("Invite");
  const invite = node("a", "Open invite page", "btn secondary");
  invite.href = "#/invite";
  shortcutSection.append(invite);

  const signOutSection = section("Sign out");
  const signOutButton = node("button", "Sign out", "btn secondary");
  signOutButton.type = "button";
  const signOutError = node("div");
  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    try {
      await signOut();
    } catch (error) {
      showError(signOutError, error.code, error.arg);
      signOutButton.disabled = false;
    }
  });
  signOutSection.append(signOutButton, signOutError);

  const deleteSection = section("Delete my account");
  deleteSection.append(
    node(
      "p",
      "This permanently deletes your account and associated SkillTube profile, listings, comments and community activity. A minimal safety record may be retained as explained in the Privacy Policy.",
    ),
  );
  const confirmationLabel = node("label", "Type DELETE to confirm");
  const confirmation = document.createElement("input");
  confirmation.type = "text";
  confirmation.autocomplete = "off";
  confirmationLabel.append(confirmation);
  const deleteError = node("div");
  const deleteButton = node("button", "Delete account", "btn danger");
  deleteButton.type = "button";
  deleteButton.addEventListener("click", async () => {
    if (confirmation.value !== "DELETE") {
      deleteError.textContent =
        "Type DELETE exactly to confirm account deletion.";
      deleteError.className = "error";
      return;
    }
    deleteButton.disabled = true;
    try {
      await call("delete_my_account");
      await signOut();
      location.replace("/");
    } catch (error) {
      showError(deleteError, error.code, error.arg);
      deleteButton.disabled = false;
    }
  });
  deleteSection.append(confirmationLabel, deleteButton, deleteError);

  app.append(
    profileSection,
    interestsSection,
    privacySection,
    imageSection,
    countrySection,
    shortcutSection,
    signOutSection,
    deleteSection,
  );
}
