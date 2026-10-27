# Website design

Desktop is the primary design target. The site combines the original animated Earth/weather background, translucent reading panels and the existing complete square illustration. The flat-background redesign was rejected by the user. `styles.css` owns shared typography, colors, navigation, panels and gallery presentation. `background.css` owns the restored background styling; `weather-dashboard.css` extends shared tokens for weather controls. Keep personal content intact when changing presentation.

## Visual system

- Source Sans 3, weights 400 and 600; four text levels of 32, 20, 16 and 14px. Map attribution is 12px.
- Light background `#f6f3ee`, surface `#fdfcfa`, text `#243236`, accent `#35666b`. Dark background `#161c20`, surface `#1f272c`, text `#e6ebec`, accent `#9bc4c6`.
- The original Three.js Earth and weather-reactive background are active across all three pages. Light mode keeps a subtle Earth outline; dark mode shows the illuminated globe. Panels retain translucent backgrounds.
- The homepage illustration remains `assets/gh_photo-v10.png`, square and uncropped. Its content and colors are unchanged by the design update.
- Navigation wraps to expose every destination on small screens. The 44px theme button follows the system until a user makes an explicit choice. Sticky navigation keeps its height; anchor offsets follow its measured height.
- Desktop hero columns use a 3:2 ratio with a 24px gap: the left introduction card stretches to the height of the square image on the right. About uses the full panel with two desktop columns: a research narrative on the left and role/education details on the right. Personal interests run across the bottom. The columns stack on narrow screens. Research uses simple dividers. Publications retain the year/title/source structure. Referee service and Contact remain separate.
- Gallery captions appear below thumbnails on both desktop and mobile. The grid uses three columns on desktop and two on phones; panoramas span two columns. Original photos remain available in the keyboard-accessible lightbox.

## Fable review adoption

The [2026-10-27 review](reviews/2026-10-27-fable-ui-review.md) is a frozen record of anonymous external advice and verification. The retained recommendations are consistent typography, accessible navigation, clearer map labels, explicit GNN availability and simpler gallery hierarchy. The user rejected the removed background, narrow About text and mismatched hero proportions; those were corrected using the original desktop layout as the reference. Weather remains a separate page. The illustration is not cropped, and observation coverage is not represented as forecast completion progress. These choices preserve the user's established preferences.

Review materials contain anonymous placeholders; real personal content and photos were used only for local visual verification. No new external AI review was needed for implementation.

## Verification

Check the three pages in light/dark themes and narrow viewports after shared style changes. Confirm navigation remains reachable, the complete portrait is visible, gallery captions and lightbox controls work, and map selection/zoom exposes readable labels. Weather behavior and model limitations are documented in [weather.md](weather.md).

The implementation was checked with real gallery photographs and the approved portrait, including desktop widths of 1280px and 1440px, plus basic narrow-screen compatibility. Desktop composition takes priority over mobile styling. Behavioral tests cover label overlap priority, retained station points and a numeric palette text-contrast floor of 4.5:1. GNN-ready interaction checks use an ignored local fixture with historical model values and explicitly shifted test times; that fixture must never be published as live data.
