/*
 * Purpose: Render the updates page and coordinate its UI actions.
 * Called by: public/js/app.js for the updates route.
 * Security: Treat route parameters and backend values as untrusted; backend authorization remains authoritative.
 */
import {
  getUpdatesFeed,
  markAllUpdatesSeen,
  getAlertCounts,
  getMyAchievements,
  markAlertsSeen,
  call,
} from "../api.js";
import { showError } from "../errors.js";
import { refreshNotificationDots } from "../components/notification-dots.js";
import { listingCard } from "../components/cards.js";

// Followed-developer feed and unread state.
export async function render(app) {
  const controls = document.createElement("div");
  const mark = document.createElement("button");
  mark.type = "button";
  mark.className = "btn secondary";
  mark.textContent = "Mark all seen";
  controls.append(mark);
  app.append(controls);
  const error = document.createElement("div");
  const list = document.createElement("div");
  list.className = "updates-list";
  app.append(error, list);
  let items;
  try {
    items = await getUpdatesFeed(50, null);
  } catch (e) {
    showError(error, e.code, e.arg);
    return;
  }
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent = "No updates from developers you follow yet.";
    list.append(empty);
  }
  const groups = new Map();
  for (const item of items) {
    const key = `${item.skill_id}:${item.kind}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.item.unseen = group.item.unseen || item.unseen;
      continue;
    }
    groups.set(key, { item: { ...item }, count: 1 });
  }
  for (const { item, count } of groups.values()) {
    const card = document.createElement("article");
    card.className = "card update-card";
    if (item.unseen) {
      const dot = document.createElement("span");
      dot.className = "notification-dot blue";
      dot.textContent = "New";
      dot.setAttribute("aria-label", "Unread update from a followed developer");
      card.append(dot);
    }
    const kindText =
      {
        post: "New listing",
        edit: "Listing edited",
        update: "Skill update · new version",
      }[item.kind] || "Developer update";
    const detail = document.createElement("p");
    detail.textContent = `${kindText}${item.note ? `: ${item.note}` : "."}${count > 1 ? ` and ${count - 1} more` : ""}`;
    const when = document.createElement("time");
    when.dateTime = item.created_at;
    when.textContent = new Date(item.created_at).toLocaleString();
    const listing = listingCard({
      id: item.skill_id,
      name: item.skill_name,
      short_desc: "",
      developer: { username: item.username },
      views: item.views,
      stars: item.stars,
      image: item.image,
      tags: item.tags,
    });
    card.append(detail, listing, when);
    list.append(card);
  }
  mark.addEventListener(
    "click",
    /* Handle the click event. */
    async () => {
      mark.disabled = true;
      try {
        await markAllUpdatesSeen();
        await refreshNotificationDots();
        list.querySelectorAll(".notification-dot.blue").forEach(
          /* Process each dot in the collection. */
          (dot) => dot.remove(),
        );
      } catch (e) {
        showError(error, e.code, e.arg);
      } finally {
        mark.disabled = false;
      }
    },
  );
  try {
    await markAllUpdatesSeen();
    list.querySelectorAll(".notification-dot.blue").forEach(
      /* Process each dot in the collection. */
      (dot) => dot.remove(),
    );
    await refreshNotificationDots();
  } catch (e) {
    showError(error, e.code, e.arg);
  }
  await renderReportNotices(app);
  await renderAchievementNotices(app);
}

// Badge achievements and their unread alerts.
async function renderAchievementNotices(app) {
  const section = document.createElement("section");
  section.className = "badge-section";
  const heading = document.createElement("h2");
  heading.textContent = "Your achievements";
  const error = document.createElement("div");
  const list = document.createElement("div");
  list.className = "badge-grid";
  section.append(heading, error, list);
  app.append(section);
  let achievements, alerts;
  try {
    [achievements, alerts] = await Promise.all([
      getMyAchievements(50),
      getAlertCounts(),
    ]);
  } catch (e) {
    showError(error, e.code, e.arg);
    return;
  }

  const unseen = Math.max(0, Number(alerts?.badges) || 0);
  const active = (achievements || []).filter(
    /* Keep badge values that match the current view. */
    (badge) => !badge.revoked,
  );
  if (!active.length) {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent = "No badges earned yet.";
    list.append(empty);
  } else {
    for (const [index, badge] of active.entries()) {
      const card = document.createElement("article");
      card.className = "card badge-card";
      const name = document.createElement("h3");
      name.textContent = badge.name || "SkillTube badge";
      const info = document.createElement("p");
      info.className = "mut";
      info.textContent = badge.tier || "";
      if (index < unseen) {
        const fresh = document.createElement("span");
        fresh.className = "notification-dot red";
        fresh.textContent = "New";
        fresh.setAttribute("aria-label", "New badge");
        card.append(fresh);
      }
      const reason = document.createElement("p");
      reason.textContent = badge.reason || "";
      card.append(name, info, reason);
      list.append(card);
    }
  }

  if (unseen <= active.length) {
    try {
      await markAlertsSeen();
      await refreshNotificationDots();
    } catch (e) {
      showError(error, e.code, e.arg);
    }
  } else {
    const note = document.createElement("p");
    note.className = "mut";
    note.textContent =
      "Some new achievements are outside the 50 most recent awards; the alert will remain unread.";
    section.append(note);
  }
}

// Report notices and the developer response flow.
async function renderReportNotices(app) {
  const section = document.createElement("section");
  section.className = "report-notices";
  const heading = document.createElement("h2");
  heading.textContent = "Reports about your listings or channel";
  const list = document.createElement("div");
  list.className = "notice-list";
  const error = document.createElement("div");
  section.append(heading, error, list);
  app.append(section);
  let notices;
  try {
    notices = await call("my_notices");
  } catch (e) {
    showError(error, e.code, e.arg);
    return;
  }
  if (!notices.length) {
    const empty = document.createElement("p");
    empty.className = "mut";
    empty.textContent = "No recent reports.";
    list.append(empty);
    return;
  }
  for (const notice of notices) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent =
      notice.kind === "skill"
        ? `Listing report: ${notice.skill_name || "AI resource"}`
        : "Channel report";
    const status = document.createElement("p");
    status.textContent = `${notice.reason} · ${notice.status} · ${notice.days_left} days left to respond`;
    card.append(title, status);
    if (notice.serious) {
      const serious = document.createElement("p");
      serious.className = "error";
      serious.textContent =
        "This serious report may have hidden the listing while it is reviewed.";
      card.append(serious);
    }
    for (const message of notice.messages || []) {
      const row = document.createElement("p");
      row.textContent = `${message.from}: ${message.body}`;
      card.append(row);
    }
    if (["open", "answered"].includes(notice.status)) {
      const form = document.createElement("form");
      const choiceLabel = document.createElement("label");
      choiceLabel.textContent = "Your response";
      const choice = document.createElement("select");
      for (const [value, text] of [
        ["fixed", "Fixed"],
        ["removed", "Removed"],
        ["disagree", "Disagree"],
        ["fork_credit", "Added fork credit"],
        ["report_false", "Report is false"],
        ["need_info", "Need more information"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        choice.append(option);
      }
      choiceLabel.append(choice);
      const replyLabel = document.createElement("label");
      replyLabel.textContent = "Reply (up to 1500 characters)";
      const reply = document.createElement("textarea");
      replyLabel.append(reply);
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "btn";
      submit.textContent = "Send response";
      const formError = document.createElement("div");
      form.append(choiceLabel, replyLabel, submit, formError);
      card.append(form);
      form.addEventListener(
        "submit",
        /* Handle the submit event. */
        async (event) => {
          event.preventDefault();
          if (Array.from(reply.value).length > 1500) {
            showError(formError, "REPLY_TOO_LONG");
            return;
          }
          submit.disabled = true;
          try {
            await call("dev_answer_report", {
              p_report: notice.id,
              p_choice: choice.value,
              p_reply: reply.value.trim() || null,
            });
            section.remove();
            await renderReportNotices(app);
          } catch (e) {
            showError(formError, e.code, e.arg);
          } finally {
            submit.disabled = false;
          }
        },
      );
      const messageForm = document.createElement("form");
      const messageLabel = document.createElement("label");
      messageLabel.textContent = "Add a message";
      const messageInput = document.createElement("textarea");
      messageLabel.append(messageInput);
      const messageButton = document.createElement("button");
      messageButton.type = "submit";
      messageButton.className = "btn secondary";
      messageButton.textContent = "Send message";
      const messageError = document.createElement("div");
      messageForm.append(messageLabel, messageButton, messageError);
      card.append(messageForm);
      messageForm.addEventListener(
        "submit",
        /* Handle the submit event. */
        async (event) => {
          event.preventDefault();
          if (
            !messageInput.value.trim() ||
            Array.from(messageInput.value).length > 1500
          ) {
            showError(messageError, "BAD_LENGTH");
            return;
          }
          messageButton.disabled = true;
          try {
            await call("dev_report_message", {
              p_report: notice.id,
              p_body: messageInput.value.trim(),
            });
            section.remove();
            await renderReportNotices(app);
          } catch (e) {
            showError(messageError, e.code, e.arg);
          } finally {
            messageButton.disabled = false;
          }
        },
      );
    }
    list.append(card);
  }
}
