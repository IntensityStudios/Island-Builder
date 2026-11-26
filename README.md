# 🏝️ Island Builder

**Play online:** https://intensitystudios.github.io/Island-Builder/

A cozy, low-poly island sandbox that runs in any modern browser – on PC or phone.
Sculpt terrain, paint the ground, place trees, houses and windmills, change the time of day and weather,
then walk around your island as a little villager and share it with a link.

Built with [three.js](https://threejs.org/) (loaded from a pinned CDN, v0.160.0). No build step, no server code:
it's plain HTML/CSS/JS modules, so it works on GitHub Pages or any static host.

## Play

- **Online:** https://intensitystudios.github.io/Island-Builder/
- **Locally on Windows:** double-click `start.bat`. It starts a local server (Python, or `npx serve` as a fallback) and opens your browser.
- **Locally anywhere else:** run `python -m http.server` in this folder and open <http://localhost:8000/>.

> Opening `index.html` directly from disk won't work – browsers block JavaScript modules on `file://`.
> An internet connection is needed the first time so three.js can load from the CDN.

## Features

- **Terrain sculpting** – raise, lower, smooth and flatten brushes with adjustable size and strength.
- **Auto colouring** by height and slope (sand ➜ grass ➜ rock ➜ snow); the beach follows the water line.
- **Terrain painting** – 11 colours (grass, forest, sand, dirt, path, rock, snow, blossom, moss, clay, lava rock) plus "Auto".
- **Animated low-poly ocean** with an adjustable water level (flood or drain your island).
- **23 procedural props** built from primitives: oak, pine, birch, palm & blossom trees, bushes, flowers, mushrooms,
  rocks, boulders, houses, huts, tents, a windmill (spinning), lighthouse, well, fences, lamps, campfire (flickering),
  benches, barrels, docks and bridges.
- **Edit props** – select, drag to move, rotate, scale, duplicate, delete. Full **undo / redo**.
- **Day/night cycle** – time slider or Auto mode. Windows, lamps, campfires and the lighthouse glow at night; stars and moon come out.
- **Weather** – clear, rain, snow and fog (with matching sky, light and sound).
- **Life** – wandering villagers, bunnies, sheep and chickens that stay on dry land (adjustable counts).
- **Walk mode** – explore in third or first person; walk on docks and bridges, swim in the sea, bump into houses and trees.
- **Save / Load** on your device (plus automatic autosave), **Export / Import** JSON files.
- **Share link** – the whole island is compressed into the URL, so anyone opening the link sees your island.
- **Random island generator** (with a village, windmill, lighthouse and dock). **Clear Island** puts back the wide, flat starter island and removes every prop (confirm, then undo). **Reset** still makes the smaller blank beach.
- **Stylized graphics** — soft toon shading, fuller trees and houses, grass and sand variation, shoreline foam, a warmer sky, and light bloom on larger screens. Phones skip the heavy effects.
- **TV / remote mode** — play with a smart-TV remote (arrows, OK, Back). It turns on for TV browsers, from the **TV** button, or with `?tv=1`.
- **Ambient synthesized audio** – ocean, wind, rain, birds by day, crickets at night, soft UI sounds. Mute any time.
- **Mobile-friendly** – big touch buttons, bottom toolbar, collapsible panels, joystick in walk mode, no page scroll or pinch-zoom,
  notch-safe layout, capped pixel ratio and smaller shadow maps on phones.

## Controls

### Build mode
| Action | PC | Phone / tablet |
| --- | --- | --- |
| Orbit camera | **View** tool + drag, or right-drag with any tool | **View** tool + drag, or two-finger drag with any tool |
| Zoom | Mouse wheel | Pinch |
| Pan | Shift + drag (View tool), middle-drag, arrow keys | Two fingers (View tool) |
| Use tool | Left-click / drag | Tap / drag with one finger |
| Tools | `1` View · `2` Place · `3` Select · `4` Raise · `5` Lower · `6` Smooth · `7` Flatten · `8` Paint | Bottom toolbar |
| Brush size | `[` / `]` or slider | Slider |
| Rotate / scale selected | `Q` / `E`, `+` / `-` | Buttons in the panel |
| Delete / duplicate | `Delete`, `Ctrl+D` | Buttons in the panel |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) | ↶ ↷ buttons |
| Toggle day/night | `N` | Time slider |
| World panel | `G` or ⚙️ | ⚙️ |
| Mute | `M` | 🔊 |
| Help | `H` | ❓ Help |

### Walk mode (`Tab` or the 🚶 Walk button)
| Action | PC | Phone / tablet |
| --- | --- | --- |
| Move | `WASD` / arrow keys | Left joystick |
| Run | `Shift` | Push the joystick all the way |
| Look | Mouse (click to lock the pointer) | Drag anywhere |
| Jump / swim up | `Space` | ⤒ button |
| First / third person | `V` | 👁️ button |
| Back to building | `Tab` or `Esc` | 🛠️ Build button |

### TV / remote mode
Turn it on with the **TV** button or by opening the page with `?tv=1`. It also turns on by itself when the browser looks like a smart TV (Tizen, webOS, Android TV, BRAVIA, Roku, Fire TV, and similar).

The buttons and text get larger, and the focused control has a yellow outline. On a remote:

| Action | Remote |
| --- | --- |
| Move the build cursor | Arrow keys (hold to go faster) |
| Use the current tool | OK / Enter |
| Move between buttons | Arrow keys, while a button is highlighted |
| Rotate / zoom the camera | On-screen ↺ ↻ ＋ － buttons |
| Rotate / delete a prop | On-screen ⟲ ⟳ 🗑️ buttons, or the select panel |
| Close a panel, leave the cursor, or stop walking | Back — Backspace, Escape, or the remote Back key |
| Walk | Arrows move and turn · OK jumps · Back returns to build |

PC mouse, keyboard and touch controls stay as they are when TV mode is off.

## Project structure

```
index.html        Page layout, UI markup and the three.js import map
css/style.css     All styling (desktop + phone layouts)
js/main.js        Entry point: renderer, camera, controls, actions, keyboard, main loop
js/world.js       World: owns all systems + get/set state, snapshots for undo
js/terrain.js     Heightmap grid, colours, sculpt & paint brushes
js/water.js       Animated ocean
js/props.js       Prop catalogue (PROP_TYPES) and PropManager (placement, glow, light pool)
js/characters.js  Villager / bunny / sheep / chicken models
js/npcs.js        Wandering NPC logic
js/walk.js        Walk mode (avatar, physics, camera, touch joystick)
js/sky.js         Sky dome, sun/moon, stars, day/night lighting
js/weather.js     Rain, snow, fog
js/tools.js       Build tools: brushes, placing, selecting, moving
js/ui.js          DOM panels, toasts, modals
js/storage.js     localStorage, JSON export/import, share-link encoding
js/history.js     Undo/redo
js/generator.js   Random island generator
js/audio.js       Web Audio ambience and UI sounds
js/noise.js       Seeded RNG and value noise
start.bat         Windows local launcher
.nojekyll         Tells GitHub Pages to serve files as-is
```

### Extending it
- **New prop:** add an entry to `PROP_TYPES` in `js/props.js` with a `label`, `icon` and `build(group, rng)` function.
  It shows up in the Place palette automatically and works with saving and share links.
  (Share links store props by their index in `PROP_ORDER`, so add new props at the **end** to keep old links working.)
- **New paint colour:** append to `PAINTS` in `js/terrain.js` (also at the end, for the same reason).
- **New brush:** handle a new tool name in `Terrain.applyBrush` and add a button with `data-tool` in `index.html`.
- `window.__island` exposes the world, tools and actions in the browser console for quick experiments.

## Notes & limitations
- Share links are typically 3–8 KB. That's fine for browsers and most chat apps, but some apps may shorten or cut very long links –
  use Export/Import JSON for those.
- Saves live in the browser's localStorage, so they are per device and per browser.
- The island is a 65×65 vertex grid (96×96 world units); props sit on the ground and follow terrain edits.
- Water level, time and weather changes are not part of undo history (terrain and props are).
- On iPhone, the ringer/silent switch also mutes web audio.
