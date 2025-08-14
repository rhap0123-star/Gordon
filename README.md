# Gordon — Online Voting System (Prototype)

A single-page HTML/CSS/JS prototype for running simple elections in-browser. Includes an in-app guide and a helper named "Gordon."

## Quick start

- Open `index.html` in your browser.
- Go to Admin to configure the election, add candidates, and generate voter access codes.
- Share codes with voters.
- Voters use the Voter tab to cast a single vote.
- View results in the Results tab.

## Features

- Admin: election setup, candidate management, voter code generation
- Voter: single-use access codes, ballot, confirmation
- Results: live or final tally with bar chart
- Data: export/import JSON, export CSV for codes, print codes
- In-app guide: How-to section and the Gordon assistant

## Notes

- This is a client-only prototype storing data in `localStorage`. It is not production-ready.
- For production, you need a secure backend, audited cryptography, and end-to-end verifiability. 
