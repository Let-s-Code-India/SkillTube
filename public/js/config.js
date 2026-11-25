/*
 * Purpose: Expose public endpoints and publishable browser configuration.
 * Called by: the app entry point and related browser modules.
 * Security: Only publishable browser keys belong here; never put service-role credentials in this file.
 */
export const config = Object.freeze({
  supabaseUrl: "https://tdxzcpigazlzzbyoccwo.supabase.co",
  supabaseAnonKey: "sb_publishable_19_NEAah3imqX5-NnWde2w_NoNz_6bK",
  siteUrl: "https://skilltube.ayushgiri-ai-21.workers.dev",
});
