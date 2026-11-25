export function imagePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/svg+xml,image/png";
  return input;
}
