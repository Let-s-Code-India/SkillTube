export function tagPicker(labelText, choices, count) {
  const field=document.createElement("fieldset");
  const legend=document.createElement("legend"); legend.textContent=labelText;
  const selected=new Set();
  choices.forEach((choice)=>{
    const label=document.createElement("label"); label.className="chip";
    const input=document.createElement("input"); input.type="checkbox"; input.value=choice;
    input.addEventListener("change",()=>{
      if(input.checked && selected.size>=count) { input.checked=false; return; }
      input.checked ? selected.add(choice) : selected.delete(choice);
    });
    label.append(input,document.createTextNode(choice));
    field.append(label);
  });
  field.prepend(legend);
  field.value=()=>[...selected];
  return field;
}
