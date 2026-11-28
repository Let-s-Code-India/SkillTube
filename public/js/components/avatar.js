export function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.map((part) => Array.from(part)[0]).join("").slice(0, 2).toUpperCase() || "S";
}

export function renderAvatar(container, name, imageUrl, size = 36) {
  container.classList.add("avatar-content");
  container.replaceChildren();
  if (typeof imageUrl === "string" && imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    image.width = size;
    image.height = size;
    image.decoding = "async";
    container.append(image);
  } else {
    container.textContent = getInitials(name);
  }
}
