const allowedTags = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

export function renderMarkdown(container, markdown) {
  if (!window.marked || !window.DOMPurify)
    throw new Error("Markdown renderer is unavailable.");
  const renderer = new window.marked.Renderer();
  renderer.html = (token) => {
    const raw = typeof token === "string" ? token : token.text;
    return String(raw || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };
  const html = window.marked.parse(String(markdown || ""), {
    gfm: true,
    breaks: false,
    renderer,
  });
  const safe = window.DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ["href"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["img", "iframe", "object", "embed", "style", "script"],
    ALLOWED_URI_REGEXP: /^https:/i,
  });
  const parsed = new DOMParser().parseFromString(safe, "text/html");
  for (const heading of parsed.querySelectorAll("h1")) {
    const replacement = parsed.createElement("h2");
    replacement.replaceChildren(...heading.childNodes);
    heading.replaceWith(replacement);
  }
  for (const link of parsed.querySelectorAll("a")) {
    const href = link.getAttribute("href");
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" || url.username || url.password) {
        link.replaceWith(document.createTextNode(link.textContent || ""));
        continue;
      }
      link.href = url.href;
      link.rel = "noopener noreferrer nofollow ugc";
      link.target = "_blank";
    } catch {
      link.replaceWith(document.createTextNode(link.textContent || ""));
    }
  }
  container.replaceChildren(
    ...Array.from(parsed.body.childNodes, (node) =>
      document.importNode(node, true),
    ),
  );
}
