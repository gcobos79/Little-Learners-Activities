# Browser tests

Playwright scripts used to check V122 (Chromium). From this folder, with Playwright installed:

```
node func.js      ../index.html            # student + teacher flows, backup, delete, Sonidos iniciales
node cloudtest.js ../index.html  /tmp/shots  # sign-in, sync between two devices, PIN, voice (fake Supabase)
node layout.js    ../index.html  /tmp/shots  # screenshots + overlap checks on 10 screen sizes
```

`mocksb.js` is an in-memory stand-in for Supabase, so these tests never touch real data.
