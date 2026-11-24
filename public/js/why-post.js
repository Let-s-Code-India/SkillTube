const button=document.querySelector("#share-post");
const status=document.querySelector("#share-status");

button.addEventListener("click",async()=>{
  button.disabled=true;
  try {
    await navigator.clipboard.writeText(document.querySelector('link[rel="canonical"]').href);
    status.textContent="Link copied.";
  } catch {
    status.textContent="Copy was unavailable. You can copy the page address from your browser.";
  } finally {
    button.disabled=false;
  }
});
