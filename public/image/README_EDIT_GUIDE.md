# image/ folder: how it works and how to edit

This whole `image/` folder goes into the SkillTube frontend repository, at the repo root, exactly as it is:

    SkillTube/
      logo.svg            <- your logo (stays in the root, not here)
      image/
        catalog.json      <- list of every image: key -> file name (the site reads this)
        badges/           <- 50 badges + 5 weekly-rank badges
        ticks/            <- Blue Tick, Master Tick
        tiers/            <- Gold / Platinum / Heroic / Diamond / Master icons
        fields/           <- 5 field icons
        templates/skill-backgrounds/   <- 20 skill-card backgrounds
        templates/channel-logos/       <- 12 channel logo templates
        ui/               <- locked badge, revoked overlay
        app/              <- favicon + app icons (PWA / push)
        _dev/             <- notes and preview sheets (not used by the site)

## File name rule (never break it)
- Badges: `badge-NN_name_tier.svg`   example `badge-24_blue-tick-creator_diamond.svg`
- Weekly: `weekly_name_tier.svg`
- Everything else: `type_NN_name.svg`
The site finds a file only through `catalog.json`. The DATABASE stores only the short key (`badge-24`), never a file name or URL.

## Change one image (daily work)
1. Design the new image. Keep the SAME file name.
2. GitHub -> open the folder -> "Add file" -> "Upload files" -> drop the file with the same name -> Commit.
3. The site rebuilds by itself in about 1-2 minutes. Every badge on every profile changes. Nothing to do in Supabase.
4. If browsers still show the old picture, open `image/catalog.json`, change `"version": 1` to `2`, commit (the site adds `?v=2` to every image address).

## Use a PNG instead of an SVG
Upload the PNG with a new name (example `badge-24_blue-tick-creator_diamond.png`), then in `catalog.json` change only that one `file` line to the PNG name. Delete the old SVG. Keep PNG small (badges: under 40 KB).

## Templates (skill-backgrounds, channel-logos)
They contain the words `__C1__ __C2__ __C3__` where the colours go. The site replaces them with the developer's chosen colours before saving. Do not remove these three words.

## Rules for any image you make yourself
No text elements, no scripts, no external links, no `<image>` tag. Badges <= 10 KB, templates <= 3 KB.
