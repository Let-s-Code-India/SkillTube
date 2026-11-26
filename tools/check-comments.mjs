/*
 * Purpose: Exercise owner comment moderation and public hidden-comment display.
 * Called by: npm run check:comments and the repository link-check workflow.
 * Security: Uses a local DOM and mocked RPC; it does not contact production services.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><main id='owner'></main><main id='public'></main>",
  {
    url: "https://skilltube.test/",
  },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const comments = [
  {
    id: "visible-root",
    parent_id: null,
    body: "Visible comment body",
    hidden: false,
    pinned: false,
    mine: false,
    author: { username: "visitor" },
  },
  {
    id: "hidden-root",
    parent_id: null,
    body: "Private hidden comment body",
    hidden: true,
    pinned: false,
    mine: false,
    author: { username: "visitor" },
  },
  {
    id: "visible-reply",
    parent_id: "visible-root",
    body: "Visible reply body",
    hidden: false,
    pinned: false,
    mine: false,
    author: { username: "visitor" },
  },
];
const actions = [];
const confirmations = [];
window.confirm = (message) => {
  confirmations.push(message);
  return true;
};
window.supabase = {
  createClient() {
    return {
      rpc: async (name, args) => {
        if (name === "list_comments") return { data: comments, error: null };
        if (name === "comment_action") {
          actions.push(args);
          const index = comments.findIndex(
            (comment) => comment.id === args.p_comment,
          );
          if (args.p_action === "delete") comments.splice(index, 1);
          if (args.p_action === "hide") comments[index].hidden = true;
          if (args.p_action === "unhide") comments[index].hidden = false;
          return { data: null, error: null };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      },
    };
  },
};

const [{ renderComments }, { errorMessage }] = await Promise.all([
  import("../public/js/components/comments.js"),
  import("../public/js/errors.js"),
]);

const ownerContainer = document.querySelector("#owner");
await renderComments(ownerContainer, "test-skill", { mine: true });

const hiddenComment = ownerContainer.querySelector(
  '[data-comment-id="hidden-root"]',
);
assert.ok(hiddenComment, "The listing owner should see hidden comments.");
assert.equal(
  hiddenComment.querySelector("p:not(.comment-meta)").textContent,
  "Hidden",
);
assert.ok(
  !hiddenComment.textContent.includes("Private hidden comment body"),
  "A hidden comment body should not be shown to the owner.",
);
assert.ok(
  [...hiddenComment.querySelectorAll("button")].some(
    (button) => button.textContent === "Unhide",
  ),
  "The owner should be able to unhide a hidden comment.",
);

const visibleRoot = ownerContainer.querySelector(
  '[data-comment-id="visible-root"]',
);
assert.deepEqual(
  [...visibleRoot.querySelectorAll(".comment-actions button")].map(
    (button) => button.textContent,
  ),
  ["Reply", "Pin", "Hide", "Delete"],
  "The owner should have reply, top-level pin, hide, and delete actions.",
);
const visibleReply = ownerContainer.querySelector(
  '[data-comment-id="visible-reply"]',
);
assert.deepEqual(
  [...visibleReply.querySelectorAll(".comment-actions button")].map(
    (button) => button.textContent,
  ),
  ["Hide", "Delete"],
  "Replies should have hide/delete but no pin action.",
);

[...visibleRoot.querySelectorAll("button")]
  .find((button) => button.textContent === "Hide")
  .click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(actions.at(-1).p_action, "hide");
assert.equal(actions.at(-1).p_comment, "visible-root");
assert.equal(
  ownerContainer.querySelector(
    '[data-comment-id="visible-root"] p:not(.comment-meta)',
  ).textContent,
  "Hidden",
);

const hiddenAfterAction = ownerContainer.querySelector(
  '[data-comment-id="visible-root"]',
);
hiddenAfterAction.querySelector(".comment-actions button").click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(actions.at(-1).p_action, "unhide");
assert.equal(
  ownerContainer.querySelector(
    '[data-comment-id="visible-root"] p:not(.comment-meta)',
  ).textContent,
  "Visible comment body",
);

const hiddenDelete = ownerContainer.querySelector(
  '[data-comment-id="hidden-root"]',
);
[...hiddenDelete.querySelectorAll("button")]
  .find((button) => button.textContent === "Delete")
  .click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(confirmations, ["Delete this comment?"]);
assert.equal(actions.at(-1).p_action, "delete");
assert.equal(actions.at(-1).p_comment, "hidden-root");

await renderComments(document.querySelector("#public"), "test-skill");
assert.equal(
  document.querySelector('#public [data-comment-id="hidden-root"]'),
  null,
  "Hidden comments must not render for visitors who are not the listing owner.",
);
assert.equal(
  errorMessage("NOT_YOUR_SKILL"),
  "This listing belongs to another developer.",
);
assert.equal(
  errorMessage("COMMENT_NOT_FOUND"),
  "This comment could not be found.",
);
assert.equal(errorMessage("BAD_ACTION"), "This action is not valid.");

dom.window.close();
console.log(
  "Owner moderation, hidden-comment visibility, and error messages passed.",
);
