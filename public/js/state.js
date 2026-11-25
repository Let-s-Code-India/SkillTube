/*
 * Purpose: Hold the current in-memory app session state.
 * Called by: the app entry point and related browser modules.
 * Security: Treat route parameters and backend data as untrusted; server-side authorization remains authoritative.
 */
export const state = {
  session: null,
  profile: null,
};
