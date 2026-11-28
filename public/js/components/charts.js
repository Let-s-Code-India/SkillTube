function svgEl(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
function hiddenTable(container, caption, headers, rows) {
  const wrapper = document.createElement("div");
  wrapper.className = "visually-hidden";
  const table = document.createElement("table");
  const cap = document.createElement("caption"); cap.textContent = caption; table.append(cap);
  const thead = document.createElement("thead"); const trh = document.createElement("tr");
  for (const header of headers) { const th=document.createElement("th"); th.scope="col"; th.textContent=header; trh.append(th); }
  thead.append(trh); table.append(thead);
  const tbody=document.createElement("tbody");
  for (const row of rows) { const tr=document.createElement("tr"); for (const value of row) { const td=document.createElement("td"); td.textContent=value; tr.append(td); } tbody.append(tr); }
  table.append(tbody); wrapper.append(table); container.append(wrapper);
}
export function horizontalBarChart(container, title, rows, metric) {
  const card=document.createElement("section"); card.className="card chart-card";
  card.append(Object.assign(document.createElement("h2"),{textContent:title}));
  const values=(rows||[]).filter((row)=>Number(row.value)>=0).slice(0,10);
  const max=Math.max(1,...values.map((row)=>Number(row.value)||0));
  const chartHeight=Math.max(260,values.length*28+30);
  const svg=svgEl("svg",{viewBox:`0 0 600 ${chartHeight}`,role:"img","aria-label":`${title}. ${values.map((r)=>`${r.label}: ${r.value}`).join(", ")}`});
  for (let step=0;step<=100;step+=20) {
    const x=145+Math.round(step/100*440);
    svg.append(svgEl("line",{x1:x,y1:8,x2:x,y2:230,class:"chart-gridline"}));
  }
  values.forEach((row,index)=>{
    const y=18+index*28; const width=Math.max(2,Math.round((Number(row.value)||0)/max*440));
    const label=svgEl("text",{x:0,y:y+11,class:"chart-label",title:row.label}); label.textContent=row.label.slice(0,14); svg.append(label);
    const bar=svgEl("rect",{x:145,y,width:Math.min(width,360),height:16,rx:8,class:"chart-bar","data-color":String(index%6+1),tabindex:"0","aria-label":`${row.label}: ${row.value}`,title:`${row.label}: ${row.value}`});
    const tip=document.createElement("div");tip.className="chart-tooltip";tip.textContent=`${row.label}: ${row.value}`;
    tip.hidden=true;
    bar.addEventListener("mouseenter",()=>{tip.hidden=false});
    bar.addEventListener("mouseleave",()=>{tip.hidden=true});
    bar.addEventListener("focus",()=>{tip.hidden=false});
    bar.addEventListener("blur",()=>{tip.hidden=true});
    card.append(tip);
    svg.append(bar);
    const value=svgEl("text",{x:145+Math.min(width,360)+8,y:y+12,class:"chart-value"});value.textContent=String(row.value);svg.append(value);
  });
  card.append(svg);
  hiddenTable(card,title,["Listing",metric],values.map((row)=>[row.label,String(row.value)]));
  container.append(card);
}
export function donutChart(container, used, limit) {
  const card=document.createElement("section"); card.className="card chart-card";
  card.append(Object.assign(document.createElement("h2"),{textContent:"Listing quota"}));
  const pct=limit>0?Math.min(100,Math.round(used/limit*100)):0;
  const svg=svgEl("svg",{viewBox:"0 0 160 160",role:"img","aria-label":`Publishing slots used: ${used} of ${limit}`});
  svg.append(svgEl("circle",{cx:80,cy:80,r:58,fill:"none",stroke:"var(--line)", "stroke-width":18}));
  const ring=svgEl("circle",{cx:80,cy:80,r:58,fill:"none",stroke:"var(--brand)", "stroke-width":18,"stroke-linecap":"round","stroke-dasharray":`${Math.PI*116*pct/100} ${Math.PI*116}`,"transform":"rotate(-90 80 80)"});
  svg.append(ring);
  const text=svgEl("text",{x:80,y:86,"text-anchor":"middle",class:"chart-number"}); text.textContent=`${used}/${limit}`; svg.append(text);
  card.append(svg);
  const legend=document.createElement("div");legend.className="chart-legend";
  for(const [label,value,kind] of [["Used",used,"used"],["Available",Math.max(0,limit-used),"available"]]){
    const item=document.createElement("span");item.className=`chart-legend-item ${kind}`;
    item.append(document.createTextNode(`${label}: ${value}`));legend.append(item);
  }
  card.append(legend);
  hiddenTable(card,"Publishing slots used",["Used","Limit"],[[String(used),String(limit)]]); container.append(card);
}
