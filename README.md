# My Board

A local, image-first collection of products worth keeping. Responsive masonry,
search, tags, favorites, notes, and a quick-save Safari WebExtension. No account,
cloud database, analytics, or third-party preview service.

Uses the actual [Home design system](https://github.com/giulioungaretti/home-design-system),
pinned to commit `0316ab7fb7b80f6c83714ddff22ec0c54b4cd87f`: its React controls,
Helvetica typography, enamel surfaces, chocolate lettering, and signal colors.
Home's exact tokens remain authoritative; `src/theme.css` maps the artifact
theme roles to them without recoloring the design system.

## Run on your Mac

Requires **Node 24+**, npm, and the system `zip` command. Dependencies are installed
from your configured npm registry. The design-system Git dependency builds
during installation, so do not use `--ignore-scripts`.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Keep this process running while using the board or
extension. `npm run dev` starts the same local API with Vite hot reload.

On the first successful startup, the board saves the
[Corsair WARTHOG Mill Green case](https://www.proshop.dk/Kabinet/Corsair-WARTHOG-Performance-Mill-Green-Kabinet-Miditower-Groen/3481067)
that inspired it, including a local picture. It does not add example products,
and deleting that first find does not cause it to reappear.

## Collecting

- **Add a find**: paste a product URL and choose **Find details**. Review the name,
  select a picture, add tags or notes, then save.
- **Manual entry** works when a website blocks preview fetching.
- **Search** matches names, domains, notes, and tags. Press `/` to focus it.
- Selected tags are combined with **AND**; favorites, untagged, sorting, and
  comfortable/compact layouts narrow the collection further.
- Masonry uses standard CSS Grid and ResizeObserver, keeping DOM order intact
  and filling columns consistently in Safari without experimental CSS flags.
- Open a card to edit or remove it. The source link opens the original shop.
- Tracking parameters are removed. Product variant parameters remain intact.
  Saving an existing URL does not overwrite the original notes or tags.

Pictures are downloaded, normalized to WebP, and retained locally at up to
1600 pixels. Supported input formats are JPEG, PNG, WebP, AVIF, and GIF (first
frame). Image failures are reported; a broken remote image is never silently
treated as a saved local copy. Private/network-internal URLs are not fetched.

## Safari quick save

The extension uses **Manifest V3 / WebExtensions** APIs rather than proprietary
Safari page-capture code. It has no background worker or passive page access:
the popup injects the extractor into the active page only when opened.

Permissions are limited to `activeTab`, `scripting`, `storage`, and the local
board at `127.0.0.1:4317` / `localhost:4317`. Captures go directly to this Mac.
The popup and web app share the same extraction and validation code, including
Product JSON-LD, Open Graph, Twitter cards, and large-image fallbacks.

### Native Safari installation

Apple requires an app container for a locally installed Safari WebExtension.
The built folder and ZIP are **not** a signed Safari application.

1. Install **full Xcode** and select it as the active developer directory.
   The standalone Command Line Tools are insufficient.
2. Run `npm run build`, then `npm run safari:project`.
3. Open the generated Xcode project in `build/safari`. Select your signing team
   and run the macOS container app.
4. Enable My Board under **Safari > Settings > Extensions**. For development
   builds, enable **Allow unsigned extensions** in Safari's developer settings.
5. In the board, open **Save from Safari**, copy the connection key, and paste
   it into the extension popup. Open a product page, click the toolbar button,
   choose its image/tags, and save.

The packaging helper uses Apple's current `safari-web-extension-packager`, or
the older `safari-web-extension-converter` on Xcode versions that provide it.
It never overwrites an existing Xcode project automatically. Rebuilding the
web extension updates `dist-extension`, which the generated project references.

See Apple's [packaging instructions](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
and [running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

The portable bundle is at `dist-extension/` and
`dist/downloads/my-board-extension.zip`, also downloadable from the app.
It can be loaded as an unpacked Chromium extension for development; Safari is
the intended browser. Native Safari signing and installation must be completed
on a Mac with full Xcode.

### No-Xcode shortcut

**Save from Safari > Copy bookmark shortcut** gives you a bookmarklet. Create a
Safari bookmark named **Save to My Board**, then replace its address with the
copied code. Selecting it on a product page opens a review form on your board.
Nothing is saved until you confirm. Some sites block bookmark scripts; use the
extension on those sites.

## Your data

The server binds **only to 127.0.0.1**. Products, tags, notes, and the extension
connection key live in `.data/board.sqlite`; image copies live in
`.data/images/`. The directory is private to your OS user and ignored by Git.
Persistence is shared by browsers on this Mac, not tied to browser storage.

**Export links & notes** downloads a portable JSON inventory, not a full image
backup. For a complete backup, stop the app and copy the entire `.data/`
directory. Restore it with the app stopped. Images are content-addressed and
retained even after a find is removed; deletion removes the board record, not
shared cached image files.

Do not put this account-free API on a public host or proxy it to your LAN.
Mutations require a secret connection key, untrusted web origins and Host
headers are rejected, and URL/image fetching validates DNS and every redirect
before connecting to a pinned public IP. The bootstrap key is readable only
from the local board, not from extension origins.

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOARD_DATA_DIR` | `.data` | Keep data outside a disposable checkout |
| `PORT` | `4317` | Change the local app port; the extension expects 4317 |
| `BOARD_SEED` | enabled | Set `0` to start without the initial Corsair find |

## Development

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Browser tests use an isolated database and server on port 4319. Unit/API tests
cover persistence, duplicate handling, metadata fallbacks, filtering, local
image copies, authorization, and private-address rejection. Browser coverage
uses Chromium and WebKit. The built popup is exercised with a browser-API
harness against the real local API; this is not a substitute for running the
signed extension inside Safari.

`src/` holds the app; `shared/` holds pure capture/validation/filtering code;
`server/` isolates SQLite, image storage, and networking; `extension/` is the
popup-only extension. `scripts/` packages the portable and native deliverables.

## Attribution

Home's **Never-Setting-Sun** palette is by **Halifax**, CC-BY:
[COLOURlovers palette 3060721](https://www.colourlovers.com/palette/3060721/Never-Setting-Sun).
See the design-system dependency's `LICENSE` and `NOTICE` for its code and
component attributions. Saved product photographs remain their owners'
property; the app does not distribute or publish your saved collection.