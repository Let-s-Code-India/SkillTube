import { call } from "../api.js";
import { showError } from "../errors.js";

function commentNode(comment, skillId, mine, onChanged) {
  const article = document.createElement("article");
  article.className = `comment${comment.pinned ? " pinned" : ""}`;
  article.dataset.commentId = comment.id;
  const heading = document.createElement("p");
  heading.className = "comment-meta";
  heading.textContent = `@${comment.author?.username || "developer"}${comment.pinned ? " · Pinned" : ""}`;
  const body = document.createElement("p");
  body.textContent = comment.body;
  article.append(heading, body);
  if (comment.expires_at && !comment.pinned) {
    const expires = document.createElement("small");
    expires.className = "mut";
    expires.textContent = `Expires ${new Date(comment.expires_at).toLocaleString()}`;
    article.append(expires);
  }
  const error = document.createElement("div");
  const actions = document.createElement("div");
  actions.className = "comment-actions";
  if (comment.parent_id === null) {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "btn secondary";
    reply.textContent = "Reply";
    reply.addEventListener("click", () =>
      showReplyForm(article, comment, skillId, onChanged),
    );
    actions.append(reply);
  }
  if (mine && comment.parent_id === null) {
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "btn secondary";
    pin.textContent = comment.pinned ? "Unpin" : "Pin";
    pin.addEventListener("click", async () => {
      pin.disabled = true;
      try {
        await call("comment_action", {
          p_comment: comment.id,
          p_action: comment.pinned ? "unpin" : "pin",
        });
        onChanged();
      } catch (e) {
        showError(error, e.code, e.arg);
      } finally {
        pin.disabled = false;
      }
    });
    actions.append(pin);
  }
  if (comment.mine) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn secondary";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await call("comment_action", {
          p_comment: comment.id,
          p_action: "delete_mine",
        });
        onChanged();
      } catch (e) {
        showError(error, e.code, e.arg);
      } finally {
        remove.disabled = false;
      }
    });
    actions.append(remove);
  }
  article.append(actions, error);
  return article;
}

function showReplyForm(article, parent, skillId, onChanged) {
  article.querySelector(".reply-form")?.remove();
  const form = document.createElement("form");
  form.className = "reply-form";
  const label = document.createElement("label");
  label.textContent = "Reply (up to 100 characters)";
  const input = document.createElement("textarea");
  input.required = true;
  input.maxLength = 100;
  input.setAttribute("aria-describedby", "reply-character-count");
  const counter = document.createElement("small");
  counter.className = "mut";
  counter.textContent = "0 / 100";
  counter.id = "reply-character-count";
  counter.setAttribute("aria-live", "polite");
  input.addEventListener("input", () => {
    counter.textContent = `${Array.from(input.value).length} / 100`;
  });
  const error = document.createElement("div");
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn";
  button.textContent = "Reply";
  label.append(input, counter);
  form.append(label, button, error);
  article.append(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (Array.from(input.value).length > 100) {
      showError(error, "COMMENT_TOO_LONG", "100");
      return;
    }
    button.disabled = true;
    try {
      await call("add_comment", {
        p_skill: skillId,
        p_body: input.value,
        p_parent: parent.id,
      });
      onChanged();
    } catch (e) {
      showError(error, e.code, e.arg);
    } finally {
      button.disabled = false;
    }
  });
}

export async function renderComments(
  container,
  skillId,
  { mine = false } = {},
) {
  container.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Comments";
  container.append(heading);
  const form = document.createElement("form");
  form.className = "comment-form";
  const label = document.createElement("label");
  label.textContent = "Add a comment (up to 200 characters)";
  const input = document.createElement("textarea");
  input.required = true;
  input.maxLength = 200;
  input.setAttribute("aria-describedby", "comment-character-count");
  const counter = document.createElement("small");
  counter.className = "mut";
  counter.textContent = "0 / 200";
  counter.id = "comment-character-count";
  counter.setAttribute("aria-live", "polite");
  input.addEventListener("input", () => {
    counter.textContent = `${Array.from(input.value).length} / 200`;
  });
  label.append(input, counter);
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn";
  button.textContent = "Comment";
  const error = document.createElement("div");
  form.append(label, button, error);
  container.append(form);
  const list = document.createElement("div");
  list.className = "comment-list";
  container.append(list);

  async function refresh() {
    let rows;
    try {
      rows = await call("list_comments", { p_skill: skillId, p_page: 0 });
    } catch (e) {
      showError(error, e.code, e.arg);
      return;
    }
    list.replaceChildren();
    const roots = rows.filter((row) => row.parent_id === null);
    for (const root of roots) {
      const thread = document.createElement("section");
      thread.className = "comment-thread";
      thread.append(commentNode(root, skillId, mine, refresh));
      rows
        .filter((reply) => reply.parent_id === root.id)
        .forEach((reply) =>
          thread.append(commentNode(reply, skillId, mine, refresh)),
        );
      list.append(thread);
    }
    if (!roots.length) {
      const empty = document.createElement("p");
      empty.className = "mut";
      empty.textContent = "No comments yet.";
      list.append(empty);
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (Array.from(input.value).length > 200) {
      showError(error, "COMMENT_TOO_LONG", "200");
      return;
    }
    button.disabled = true;
    try {
      await call("add_comment", {
        p_skill: skillId,
        p_body: input.value,
        p_parent: null,
      });
      input.value = "";
      counter.textContent = "0 / 200";
      await refresh();
    } catch (e) {
      showError(error, e.code, e.arg);
    } finally {
      button.disabled = false;
    }
  });
  await refresh();
}
