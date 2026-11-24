export function resourceCard(name, description, meta) {
  const article=document.createElement("article"); article.className="card";
  const heading=document.createElement("h2"); heading.textContent=name;
  const desc=document.createElement("p"); desc.textContent=description;
  const small=document.createElement("p"); small.className="mut"; small.textContent=meta || "";
  article.append(heading,desc,small);
  return article;
}
