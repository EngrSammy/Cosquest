# Wale pages: design | built

- `MNN.jpg` puts Adewale's design (left) next to the built screen (right). There is one image for each of M01 to M32.
- These come from the web build at 390 x 844, against the `wale-pages-backend` branch run locally with seeded data that matches the designs.
- `android/` is the native Android release build on an emulator: chat in light and dark, Options A and B, long-press, the Spark overlay, mentions, and the Appearance layout picker.
- `test-backend/` holds the main screens against the TEST server, signed in as `dami_e2e`. TEST runs `main`, so ranks, the online count and the Owner/Admin labels are not there yet.
- Emoji show as boxes in the web screenshots only, because the headless browser has no emoji font. They render on Android.

The remaining differences and how the data was made are listed in `../wale-pages-audit.md`.
