# form-bot

A browser automation tool that fills and submits Google Forms using Playwright and an AI model (Gemini) via an OpenAI-compatible client. Paste a form URL, click Run, and watch it work in real time.

![Demo](https://img.shields.io/badge/status-active-00ff88?style=flat-square) ![Node](https://img.shields.io/badge/node-v22+-black?style=flat-square) ![AI](https://img.shields.io/badge/AI-Gemini%203%20Flash-blue?style=flat-square)

| Idle | Running |
| --- | --- |
| ![Idle screenshot](assets/screenshot-idle.png) | ![Running screenshot](assets/screenshot-running.png) |

## What it does

- Opens Google Forms in a real Chrome browser
- Detects question types: multiple choice, short answer, paragraph
- Uses a Gemini model (`google/gemini-3-flash-preview`) to answer questions
- Autofills personal info (email, phone) automatically
- Streams live logs to the browser as it runs
- Strips common automation flags to reduce bot detection

## Tech Stack

- **Playwright** — browser automation
- **OpenAI-compatible client** — talks to a Gemini model (`google/gemini-3-flash-preview`)
- **Express** — local web server
- **Server-Sent Events** — real-time log streaming to the UI

## Setup

1. Clone the repo
```bash
git clone https://github.com/benjamin-nnaemeka-dev/form-bot.git
cd form-bot
```

2. Install dependencies (uses `package.json`):
```bash
pnpm install
pnpm exec playwright install chromium
```

3. Create a `.env` file in the project root:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Review `server.js` and update the Playwright profile path and personal info:
```js
const DEDICATED_PROFILE_DIR = "C:\\Users\\YOUR_USERNAME\\AppData\\Local\\PlaywrightQuizProfile";
// PERSONAL_INFO { email, fullName, phone, school, ... }
```

Notes on the AI client
- The current server implementation uses the `openai` package pointed at a compatible endpoint and calls the model `google/gemini-3-flash-preview`.
- If you rely on a proxy or alternate endpoint, check the `baseURL` (in `server.js`) and set `GEMINI_API_KEY` accordingly.

5. Run the server
```bash
node server.js
```

6. Open the UI

http://localhost:3000

On first run a Chrome window will open so you can sign in to Google (the script uses a persistent profile directory). After that, runs go straight to the form.

## How It Works

1. Express serves the frontend and exposes a `/run` endpoint
2. The frontend sends the form URL and opens an SSE connection for live logs
3. Playwright launches a persistent Chrome context with automation flags stripped
4. The script scans the form for `[role="listitem"]` and `[role="heading"]` elements
5. For each question it detects the input type and either autofills or asks the AI model
6. The model response is used to fill inputs or choose options
7. Logs stream back to the browser in real time via SSE

## Project Structure

```
form-bot/
├── server.js       # Express server + Playwright automation (update profile & personal info here)
├── index.html      # Frontend UI
├── .env            # API key (not committed)
├── .gitignore
└── package.json
```

## License

[MIT License](LICENSE) - free to use, modify and distribute.