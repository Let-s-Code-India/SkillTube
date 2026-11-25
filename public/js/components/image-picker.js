/*
 * Purpose: Provide reusable image picker UI for the browser app.
 * Called by: App route modules and shared page components.
 * Security: Treat API data as untrusted. Use safe DOM APIs and validate user-controlled URLs.
 */
export function imagePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/svg+xml,image/png";
  return input;
}
