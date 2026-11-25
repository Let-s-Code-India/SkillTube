import { call } from "../api.js";
import { renderMarkdown } from "./markdown.js";

const lastSeenKey="skilltube.announcements.last_seen_id";

function latestAnnouncement(announcements) {
  return [...announcements].sort((a,b)=>Date.parse(b.starts_at||0)-Date.parse(a.starts_at||0))[0]||null;
}

export function updateAnnouncementDot(announcements) {
  const dot=document.querySelector("#announcement-dot");
  if(!dot)return;
  const latest=latestAnnouncement(announcements);
  const unread=Boolean(latest&&localStorage.getItem(lastSeenKey)!==String(latest.id));
  dot.hidden=!unread;
  dot.setAttribute("aria-label",unread?"Unread announcements":"No unread announcements");
}

export async function renderAnnouncementBanner(app) {
  const announcements=await call("active_announcements");
  updateAnnouncementDot(announcements||[]);
  if(!announcements?.length)return;
  const section=document.createElement("section");
  section.className="card announcement-banner";
  const heading=document.createElement("h2");
  heading.textContent="Announcements";
  section.append(heading);
  for(const announcement of announcements.slice(0,3)) {
    const item=document.createElement("article");
    item.className="announcement-item";
    const title=document.createElement("h3");
    title.textContent=announcement.title;
    if(announcement.pinned)title.append(document.createTextNode(" · Pinned"));
    const body=document.createElement("div");
    body.className="announcement-body";
    renderMarkdown(body,announcement.body_md);
    item.append(title,body);
    section.append(item);
  }
  const link=document.createElement("a");
  link.href="#/announcements";
  link.textContent="View all announcements";
  section.append(link);
  app.prepend(section);
}

export function markAnnouncementsSeen(announcements) {
  const latest=latestAnnouncement(announcements||[]);
  if(latest)localStorage.setItem(lastSeenKey,String(latest.id));
  updateAnnouncementDot(announcements||[]);
}
