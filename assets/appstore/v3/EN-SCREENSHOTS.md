# English store screenshots — 31 October 2026

The English set uses actual English app captures from the user-provided demo account. User-entered record names and Turkish bank/company names remain as stored. Credentials are not included in the repository. The user-authorized local credential file is `~/.config/vademde/demo-account.json` (mode `0600`); read it programmatically without logging its contents.

## App Store

- `captures-en/`: original 1320 × 2868 iOS simulator captures, with route provenance in `manifest.json`.
- `src/shots-en/`: the same captures resized to the existing template coordinate system, 1206 × 2622.
- `out69-en/`: 12 RGB PNGs, 1320 × 2868.
- `out65-en/`: 12 RGB PNGs, 1284 × 2778.
- `out63-en/`: 12 RGB PNGs, 1206 × 2622.
- Regenerate with `L=en ./render.sh`. English rendering fails if any required English capture is missing.

Existing Turkish source screenshots and output sets are preserved; slides 11–12 add native Turkish My Assets captures. Old Turkish magnified crops and synthetic OCR overlays are omitted from the English composition. The camera preview is blank on the iOS simulator; the adjacent review slide shows the real demo loan document.

## Google Play

- `src/shots-en-android/`: 12 actual Android captures at 1080 × 2400, from the production 1.0.9 build (version code 20); provenance is recorded in `manifest.json`.
- `src/shots-tr-android/`: the corresponding 12 native Turkish captures from the same production build.
- `play-en/`: 12 RGB compositions at 1440 × 2560, plus `feature.png` at 1024 × 500.
- `play-en-upload/`: the selected 8-image set and feature graphic. `order.json` records the order, source files, and English alt text.
- Regenerate with `L=en ./render-play.sh`. This requires the Android source images; it never substitutes iOS screenshots or a synthetic status bar.

The Play selection is Home, Review, Calendar, Cheques and notes, Loans, Credit cards, My Assets, Asset Details. Turkish and English upload folders each contain eight ordered images plus the feature graphic. Camera and Banks remain alternatives. The Android emulator camera shows its virtual room; that image is excluded from the upload selection. All Android captures in both languages were refreshed from the R8-optimized 1.0.9 release bundle.

## Scope

App Store Connect 1.0.9 now contains 10 images per language in each required iPhone size (40 processed images). Upload order: 3, 2, 4, 5, 6, 7, 8, 9, 11, 12. Production schema and web deployment are complete. See `docs/15-yayin-gunlugu.md` for the final build and store submission states.

References: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [Google Play preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
