import { call } from "./api.js";
import { showError } from "./errors.js";

const state=document.querySelector("#api-status");
const details=document.querySelector("#api-details");

try {
  const stats=await call("public_stats");
  state.textContent="API reachable";
  details.textContent=`${Number(stats?.skills||0).toLocaleString()} active listings · ${Number(stats?.developers||0).toLocaleString()} developers`;
} catch(error) {
  state.textContent="API unavailable";
  showError(details,error.code,error.arg);
}
