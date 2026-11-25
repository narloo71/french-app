# Français

An installable web app (PWA) for practising intermediate French on a phone: spaced-repetition flashcards, vocabulary quizzes, pronunciation, and verb conjugation drills. Works offline once installed.

- Add vocabulary in `data/vocab.js`, verbs in `data/verbs.js`.
- `npm test` checks the conjugation, answer-checking and scheduling logic.
- `npm start` serves it locally at http://localhost:8000.
- After changing files, bump `VERSION` in `sw.js` so installed copies update.
