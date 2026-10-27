# Website design

The site uses a quiet “paper studio” appearance: warm white surfaces, muted teal links, blue-gray dark mode and the existing complete square illustration. `styles.css` owns shared typography, colors, navigation, panels and gallery presentation. `weather-dashboard.css` extends those tokens for weather controls. Keep personal content intact when changing presentation.

## Visual system

- Source Sans 3, weights 400 and 600; four text levels of 32, 20, 16 and 14px. Map attribution is 12px.
- Light background `#f6f3ee`, surface `#fdfcfa`, text `#243236`, accent `#35666b`. Dark background `#161c20`, surface `#1f272c`, text `#e6ebec`, accent `#9bc4c6`.
- Static background, light borders and restrained shadows. Pages no longer load Three.js or the animated Earth/weather backgrounds. Their old source files are retained but inactive.
- The homepage illustration remains `assets/gh_photo-v10.png`, square and uncropped. Its content and colors are unchanged by the design update.
- Navigation wraps to expose every destination on small screens. The 44px theme button follows the system until a user makes an explicit choice. Sticky navigation keeps its height; anchor offsets follow its measured height.
- About text is limited to 72ch. Research uses simple dividers. Publications retain the year/title/source structure. Referee service and Contact remain separate.
- Gallery captions appear below thumbnails on both desktop and mobile. The grid uses three columns on desktop and two on phones; panoramas span two columns. Original photos remain available in the keyboard-accessible lightbox.

## Fable review adoption

The [2026-10-27 review](reviews/2026-10-27-fable-ui-review.md) is a frozen record of anonymous external advice and verification. The implementation adopts its corrected recommendations: consistent hierarchy, less decoration, accessible navigation, clearer map labels, explicit GNN availability and simpler gallery hierarchy. Weather remains a separate page. The illustration is not cropped, and observation coverage is not represented as forecast completion progress. These choices preserve the user's established preferences.

Review materials contain anonymous placeholders; real personal content and photos were used only for local visual verification. No new external AI review was needed for implementation.

## Verification

Check the three pages in light/dark themes and narrow viewports after shared style changes. Confirm navigation remains reachable, the complete portrait is visible, gallery captions and lightbox controls work, and map selection/zoom exposes readable labels. Weather behavior and model limitations are documented in [weather.md](weather.md).

The implementation was checked with real gallery photographs and the approved portrait, including 390px and 320px navigation. Behavioral tests cover label overlap priority, retained station points and a numeric palette text-contrast floor of 4.5:1. GNN-ready interaction checks use an ignored local fixture with historical model values and explicitly shifted test times; that fixture must never be published as live data.
