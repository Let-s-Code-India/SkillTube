# notes.md (SkillTube SVG pack)

## What is in the pack
- 55 badges (50 numbered + 5 weekly), 2 ticks, 5 tier icons, 5 field icons, 2 UI files, 20 skill templates, 12 channel templates, favicon.svg, 5 PNG app icons, 3 preview sheets, manifest.json, SIZE_REPORT.md. 102 SVG files, verifier result: 0 errors, 0 files over their limit.

## Decisions (unchanged from round 1)
1. Palette follows your multicolor isometric logo (8 logo colors = field accents, thick dark outline and faceted look). Tier palettes follow the brief.
2. Tiers differ by silhouette AND material: circle / hexagon / heater shield / octagon gem / winged star-burst crest. Double rim on every badge.
3. Blue Tick = rounded hexagon, Master Tick = 8-lobe scalloped gold seal.
4. Field icon names: field-1-velocity, field-2-network, field-3-global, field-4-fusion, field-5-authority.
5. The root `xmlns="http://www.w3.org/2000/svg"` is the only allowed `http:` / `//` string; the verifier allows exactly that attribute.
6. Template tokens `__C1__ __C2__ __C3__` are valid only in `templates/`.
7. `<use href="#id">` (internal only) is used in skill templates to mirror the side art; it is on your allowed list.

## Round 2 changes
**A. channel-template-04** rebuilt: three evenly rotated (0/60/120 deg) thick ellipses (stroke 11, rx 88 so max radius 93), one filled centre disc, perfectly centred at (128,128).
**B. channel templates 01-12** all redrawn: one centred shape each, max radius 92 of 128 (at least 36 units from the square edge), minimum stroke 6, no clipping against the border.
- 01 concentric rings + core; 02 twelve thick round rays (end at r 86) + disc; 03 six hexagons + core; 05 full closed disc with bold centred chevrons; 06 rounded-square mosaic fully inside r 93; 07 layered waves inside a ringed disc r 90 (clipPath ct07-c); 08 twelve-point sun star (r 92) + core; 09 complete gear with ring and solid hub; 10 eight petals + centre; 11 clean phyllotaxis spiral (r 90 max) with clear centre disc; 12 large centred isometric cube.
**C. skill templates 01-20** all redrawn: bold side art (min stroke 3, mostly filled shapes), no tiny scattered pieces, nothing half-cut (shapes either bleed off the outer edge on purpose or keep 10+ units margin), centre 40% (x 120 to 280) empty. White accents use 16 to 60 percent opacity, no black. Side art is drawn once and mirrored (`use`).
- New in this round: 14 wide diagonal ribbons (was concentric ellipses), 19 stacked rounded paper layers (was circle pairs), 04 layered rays with soft glow circle, 09 stepped contour blobs. All 20 are different compositions; 11 (bold bubbles) no longer resembles 19.
- Max size 2,743 bytes (limit 3,072).
**D. Master tier** (badge-09, 26, 29, 30, 36, 40, 42, 45, 48, 50, weekly-apex-10): the whole crest (plate + emblem) is wrapped in `translate(25.6 25.6) scale(.9)`. I used 0.9 instead of 0.94 because rule 7 allows only one decimal; wings and crown now have well over 8 units free.
**E. Badge items**
- badge-01, 02, 05, 11, 12, 21, 31 emblem +13 percent; 14 +10; 07, 18, 37 +8; 17, 47 +10; 35 +4 (heroic enamel is narrower, so less room).
- Gold circle badges (all Gold tier files): the thin light outer stroke is removed; the outer rim is now one clean closed pale-gold ring.
- badge-06: about 55 bigger dots plus a soft solid star underlay (was hundreds of tiny dots). badge-33: about 60 larger dots (was about 190).
- badge-24 now a faceted blue 8-point star with white star core; 25 blue ring medallion with white star inside the laurel; 28 faceted blue gem (rhombus) at the web centre; 41 bezel-dotted blue medal with white diamond under the crown. None uses the hexagon + check of the Blue Tick any more.
- weekly-climber-40: side bars removed. weekly-rise-50: yellow dot replaced by a five-point star.
- Look-alikes: badge-03 is now a square-toothed gear (was a pointed tread wheel); badge-39 outer ring is a thin dotted ring (no tick marks). 08 (bolt in a ring) and 36 (zigzag ribbon over a globe) were already clearly different at 64 px and were left as they are.
**F. Previews** rebuilt: preview-sheet-badges.png (55 on light and dark), preview-sheet-misc.png (ticks at 14/24/48/96 px, tiers, fields, ui, favicon on light and dark), preview-sheet-templates.png (all 20 skill templates in a warm, a very light and a very dark colour set, and all 12 channel templates cropped to circles at 128 px and 48 px). Note: you asked for 2 sheets before and 3 now, so there is a new file `preview-sheet-templates.png`.

## Checks done
- Rendered all badges at 128 px, 32/64 px sheets and all templates and looked at them (white and dark backgrounds). Re-ran the verifier after every build: 0 errors.

## Honest limits / not fixed
- I could not test in real Chrome/Firefox/Safari; rendering was checked with cairosvg only. Please open one badge and one skill template (they use `use`) in each browser.
- On a very light colour set, the white accents of the skill templates become faint; the C3 accent colour carries the pattern. If the colour set is very light, choose a dark or saturated C3.
- badge-29 (constellation brain) is still less clearly a brain than badge-34; badge-25's ring medallion is small inside the laurel. Both readable, but I did not redesign them since you did not list them.
- Master badges are 10 percent smaller (not 6) because of the one-decimal rule; say so if you prefer 6 percent with a decimal scale.
