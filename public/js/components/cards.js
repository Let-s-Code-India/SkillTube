import { config } from "../config.js";
import { safeUrl } from "../safe-url.js";

function imageSource(image) {
  const path = image?.path;
  if (typeof path !== "string" || !path || path.split("/").some((part) => part === "." || part === "..")) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return safeUrl(`${config.supabaseUrl}/storage/v1/object/public/skilltube-images/${encoded}`, {
    allowHash: false,
    allowPath: false
  });
}

export function imageFrame(image, alt, className = "listing-image-frame") {
  const frame = document.createElement("div");
  frame.className = className;
  const src = imageSource(image);
  if (!src) {
    const placeholder=document.createElement("span");
    placeholder.className="listing-image-placeholder";
    placeholder.textContent=Array.from(alt||"?")[0]||"?";
    placeholder.setAttribute("aria-hidden","true");
    frame.append(placeholder);
    return frame;
  }
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt || "";
  img.loading = "lazy";
  img.decoding = "async";
  const isLogo=className.includes("logo");
  img.width = isLogo ? 40 : 800;
  img.height = isLogo ? 40 : 600;
  const zoom = Number(image.zoom);
  const x = Number(image.x);
  const y = Number(image.y);
  img.style.setProperty("--image-zoom", String(Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1));
  img.style.setProperty("--image-x", `${Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50}%`);
  img.style.setProperty("--image-y", `${Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50}%`);
  frame.append(img);
  return frame;
}

function tagSlug(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function listingCard(skill) {
  const article = document.createElement("article");
  article.className = "card listing-card";
  article.append(imageFrame(skill.image, skill.name));

  const content = document.createElement("div");
  content.className = "listing-card-content";
  const heading = document.createElement("h2");
  const title = document.createElement("a");
  title.href = safeUrl(`#/skill/${encodeURIComponent(skill.id)}`) || "#";
  title.textContent = skill.name || "Untitled listing";
  heading.append(title);
  content.append(heading);
  if(skill.short_desc) {
    const description = document.createElement("p");
    description.textContent = skill.short_desc;
    content.append(description);
  }

  const developer = skill.developer || {};
  const byline = document.createElement("p");
  byline.className = "listing-byline";
  const username = String(developer.username || "");
  const logo = imageFrame(developer.logo, developer.name || username, "listing-developer-logo");
  if (logo.firstChild) byline.append(logo);
  const by = document.createTextNode("by ");
  const developerLink = document.createElement("a");
  developerLink.href = safeUrl(`#/dev/${encodeURIComponent(username)}`) || "#";
  developerLink.textContent = `@${username || "developer"}`;
  byline.append(by, developerLink);
  if (developer.tick || skill.verified) {
    const tick = document.createElement("span");
    tick.className = "listing-verified";
    tick.textContent = "✓";
    tick.setAttribute("aria-label", developer.tick || "Verified owner");
    byline.append(" ", tick);
  }
  content.append(byline);

  const tags = ["t1", "t2", "t3"].flatMap((level) => skill.tags?.[level] || []);
  if (tags.length) {
    const chips = document.createElement("div");
    chips.className = "chips listing-tags";
    for (const tag of tags) {
      const slug = tagSlug(tag);
      if (!slug) continue;
      const link = document.createElement("a");
      link.className = "chip";
      link.href = safeUrl(`/topic/${encodeURIComponent(slug)}/`) || "#";
      link.textContent = tag;
      chips.append(link);
    }
    content.append(chips);
  }

  const stats = document.createElement("p");
  stats.className = "listing-stats";
  stats.textContent = `${Number(skill.views || 0).toLocaleString()} views · ${Number(skill.stars || 0).toLocaleString()} stars`;
  content.append(stats);
  article.append(content);
  return article;
}

export function resourceCard(name, description, meta) {
  const article = document.createElement("article");
  article.className = "card";
  const heading = document.createElement("h2");
  heading.textContent = name;
  const desc = document.createElement("p");
  desc.textContent = description;
  const small = document.createElement("p");
  small.className = "mut";
  small.textContent = meta || "";
  article.append(heading, desc, small);
  return article;
}
