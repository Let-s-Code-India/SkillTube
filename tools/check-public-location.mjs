import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const forbidden=/mumbai|maharashtra|made\s+in\s+(?:india|mumbai)|built\s+in\s+india/i;
const roots=["public","content"];
const extensions=new Set([".html",".js",".json",".txt",".md",".css",".xml",".svg",".webmanifest"]);
const failures=[];

async function checkDirectory(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) {
      await checkDirectory(file);
    } else if(extensions.has(path.extname(entry.name).toLowerCase())) {
      const source=await readFile(file,"utf8");
      for(const match of source.matchAll(new RegExp(forbidden.source,"gi"))) {
        const line=source.slice(0,match.index).split("\n").length;
        failures.push(`${file}:${line}: prohibited location wording`);
      }
    }
  }
}

for(const directory of roots)await checkDirectory(directory);
const readme=await readFile("README.md","utf8");
for(const match of readme.matchAll(new RegExp(forbidden.source,"gi"))) {
  const line=readme.slice(0,match.index).split("\n").length;
  failures.push(`README.md:${line}: prohibited location wording`);
}

if(failures.length) {
  console.error(failures.join("\n"));
  process.exitCode=1;
} else {
  console.log("Public location wording check passed.");
}
