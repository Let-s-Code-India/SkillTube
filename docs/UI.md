# SkillTube UI

## Tokens

The CSS stack is loaded in this order: `tokens.css`, `themes.css`, `base.css`, `layout.css`, `components.css`, `pages.css`, `charts.css`, and `motion.css`. Components use semantic variables from `themes.css`; raw colours belong only in that file.

Core semantic tokens include `--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--line`, `--brand`, `--on-brand`, `--accent`, `--link`, `--success`, `--warning`, `--danger`, `--focus`, `--chip-*`, `--shadow-*`, `--hero-gradient`, and `--chart-1` through `--chart-6`.

## Themes

Themes are `system`, `light`, `dark`, `hacker`, `midnight`, `sunrise`, and `contrast`. The preference is stored as `skilltube.theme`. To add a theme, define every semantic token in `themes.css`, add it to `theme-boot.js` and `theme-picker.js`, and add it to `check:contrast`.

## Layout and components

The shell uses a sticky 64px top bar, topic chip rail, collapsible navigation drawer, responsive listing grid, and shared footer. Touch targets are at least 44px. Existing IDs remain `#app`, `#auth-error`, `#menu`, `#drawer`, `#close-menu`, `#admin-nav`, `#blue-dot`, `#red-dot`, `#announcement-dot`, and `#main`.

## Motion

Use only opacity and transform. Durations are 120ms, 200ms, and 320ms with the shared easing curve. Reduced-motion mode disables movement.

## Decisions

- The existing backend RPC and Edge Function names and arguments are unchanged.
- Static, SPA, and Worker pages share the same CSS and theme boot mechanism.
- The existing public footer stamp text is retained.
