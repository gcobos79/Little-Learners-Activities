# Browser tests

Playwright scripts used to check V122 (Chromium). From this folder, with Playwright installed:

```
node func.js      ../index.html            # student + teacher flows, backup, delete, Sonidos iniciales
node cloudtest.js ../index.html  /tmp/shots  # sign-in, sync between two devices, PIN, voice (fake Supabase)
node dbtest.js    ../index.html  /tmp/shots  # students table, quiz tables, pictures in storage, V122 → V123 move
node resultstest.js ../index.html  /tmp/shots  # results: one per month, offline queue, ranking
node historytest.js ../index.html          # browser Back/Forward and the logo home button
node boardtest.js  ../index.html  /tmp/shots  # end-of-quiz class results
node voicetest.js  ../index.html            # voice type per quiz, always some voice
node storagetest.js ../index.html           # saving when browser storage is full
node duplicates.js                       # duplicate folders are merged
node layout.js    ../index.html  /tmp/shots  # screenshots + overlap checks on 10 screen sizes
```

`mocksb.js` is an in-memory stand-in for Supabase, so these tests never touch real data.
