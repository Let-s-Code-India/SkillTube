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
  const list=document.createElement("ol");
  list.className="weekly-bar-list";
  list.setAttribute("aria-label",title);
  values.forEach((row,index)=>{
    const item=document.createElement("li");
    item.className="weekly-bar-row";
    const label=document.createElement("span");
    label.className="weekly-bar-label";
    label.textContent=String(row.label);
    label.title=String(row.label);
    const track=document.createElement("div");
    track.className="weekly-bar-track";
    const width=Math.max(0,Math.min(75,Math.round((Number(row.value)||0)/max*75)));
    const endpoint=Math.round(width/5)*5;
    const svg=svgEl("svg",{viewBox:"0 0 100 8","aria-hidden":"true","preserveAspectRatio":"none"});
    svg.append(svgEl("rect",{x:0,y:0,width:Math.max(width,1),height:8,rx:4,class:"chart-bar","data-color":String(index%6+1)}));
    const value=document.createElement("span");
    value.className=`weekly-bar-value end-${endpoint}`;
    value.textContent=String(row.value);
    value.title=`${row.label}: ${row.value}`;
    track.append(svg,value);
    item.append(label,track);
    list.append(item);
  });
  card.append(list);
  hiddenTable(card,title,["Listing",metric],values.map((row)=>[row.label,String(row.value)]));
  container.append(card);
}
export function donutChart(container, used, limit) {
  const card=document.createElement("section"); card.className="card chart-card";
  card.append(Object.assign(document.createElement("h2"),{textContent:"Listing quota"}));
  const safeUsed=Math.max(0,Number(used)||0);
  const safeLimit=Math.max(0,Number(limit)||0);
  const pct=safeLimit>0?Math.min(100,Math.round(safeUsed/safeLimit*100)):0;
  const svg=svgEl("svg",{viewBox:"0 0 160 160",role:"img","aria-label":`Publishing slots used: ${used} of ${limit}`});
  svg.append(svgEl("circle",{cx:80,cy:80,r:58,fill:"none",stroke:"var(--line)", "stroke-width":18}));
  const ring=svgEl("circle",{cx:80,cy:80,r:58,fill:"none",stroke:"var(--brand)", "stroke-width":18,"stroke-linecap":"round","stroke-dasharray":`${Math.PI*116*pct/100} ${Math.PI*116}`,"transform":"rotate(-90 80 80)"});
  svg.append(ring);
  const number=svgEl("text",{x:80,y:72,"text-anchor":"middle","dominant-baseline":"central",class:"chart-number"});
  number.textContent=safeLimit>0?`${safeUsed} / ${safeLimit}`:"—";
  const caption=svgEl("text",{x:80,y:94,"text-anchor":"middle","dominant-baseline":"central",class:"chart-caption"});
  caption.textContent="listings used";
  const center=svgEl("g",{class:"donut-center"});
  center.append(number,caption);
  svg.append(center);
  card.append(svg);
  const legend=document.createElement("div");legend.className="chart-legend";
  for(const [label,value,kind] of [["Used",safeUsed,"used"],["Available",Math.max(0,safeLimit-safeUsed),"available"]]){
    const item=document.createElement("span");item.className=`chart-legend-item ${kind}`;
    item.append(document.createTextNode(`${label}: ${value}`));legend.append(item);
  }
  card.append(legend);
  hiddenTable(card,"Publishing slots used",["Used","Limit"],[[String(safeUsed),String(safeLimit)]]); container.append(card);
}
