# Frontend specification

The frontend is plain HTML, CSS and native ES modules. It has no build step and
uses no framework. Public pages must render without JavaScript. The app uses
hash routes and keeps GitHub provider tokens only for the current tab.

The shared frontend uses semantic theme tokens and the `skilltube.theme`
preference. Static, SPA, and Worker pages load the same CSS stack and theme boot
script. Listing cards use 16:9 generated or uploaded covers, and dashboard charts
are SVG elements built in JavaScript with accessible tables and labels.
