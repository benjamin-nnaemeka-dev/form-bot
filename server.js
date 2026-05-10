require("dotenv").config();
const express = require("express");
const { chromium } = require("playwright");
const path = require("path");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Configure your Gemini API key and the directory for the Playwright profile.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = process.env.BASE_URL
const DEDICATED_PROFILE_DIR = "C:\\Users\\YOUR_USERNAME\\AppData\\Local\\PlaywrightQuizProfile";

// Fill in your personal info here for automatic filling
const PERSONAL_INFO = {
    email: "your.email@example.com",
    fullName: "Your Full Name",
    phone: "+0000000000",
};

const client = new OpenAI({
    apiKey: GEMINI_API_KEY,
    baseURL: BASE_URL
})

// Sends a multiple choice question to Gemini and returns the answer
async function askGemini(questionText, options) {
    const optionsText = options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
    const promptText = `You are a knowledgeable assistant answering a multiple-choice question.
Choose the most correct answer based on general knowledge and careful reasoning.

Question: ${questionText}

Options:
${optionsText}

Reply with ONLY the exact text of the correct option. Nothing else.`;
    const result = await client.chat.completions.create({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: promptText }],
    })
    return result.choices[0].message.content.trim();
}

// Sends an open text question to Gemini with full identity context
async function askGeminiOpenText(questionText) {
    const promptText = `You are ${PERSONAL_INFO.fullName}.
You are filling out a form or answering a question as yourself.

Here is some information about you for context:
- Full name: ${PERSONAL_INFO.fullName}
- Email: ${PERSONAL_INFO.email}
- Phone: ${PERSONAL_INFO.phone}

Answer the following question in 1-3 concise sentences, using the information above where appropriate. If the question asks for your name or personal details, provide them exactly as given.

Question: ${questionText}

Reply with ONLY the answer. Nothing else.`;

    const result = await client.chat.completions.create({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: promptText }],
    })
    return result.choices[0].message.content.trim();
}

// SSE endpoint, streams live logs to the browser
app.get("/run", async (req, res) => {
    const formUrl = req.query.url;

    if (!formUrl) {
        return res.status(400).json({ error: "No form URL provided" });
    }

    // Set up Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const log = (msg, type = "info") => {
        res.write(`data: ${JSON.stringify({ msg, type })}\n\n`);
    };

    try {
        log("Launching Chrome...", "info");

        const context = await chromium.launchPersistentContext(DEDICATED_PROFILE_DIR, {
            headless: false,
            channel: "chrome",
            ignoreDefaultArgs: ["--enable-automation"],
            args: [
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
            ],
        });

        const page = await context.newPage();

        log("Opening form...", "info");
        await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);

        let pageNum = 1;

        while (true) {
            log(`── Page ${pageNum} ──`, "page");

            const questions = await page.$$('[role="listitem"]');

            if (!questions.length) {
                log("No questions found on this page.", "warn");
            }

            for (const question of questions) {
                const questionEl = await question.$('[role="heading"]');
                if (!questionEl) continue;

                const questionText = (await questionEl.innerText()).trim();
                log(`Q: ${questionText}`, "question");

                const labelLower = questionText.toLowerCase();

                const textInput = await question.$('input[type="text"], input[type="email"], input[type="tel"]');

                if (textInput) {
                    if (labelLower.includes("email")) {
                        await textInput.fill(PERSONAL_INFO.email);
                        log(`Filled email: ${PERSONAL_INFO.email}`, "success");
                    } else {
                        const response = await askGeminiOpenText(questionText);
                        await textInput.fill(response);
                        log(`Gemini wrote: ${response}`, "success");
                    }
                    await page.waitForTimeout(500);
                    continue;
                }

                const textarea = await question.$("textarea");
                if (textarea) {
                    const response = await askGeminiOpenText(questionText);
                    await textarea.fill(response);
                    log(`Gemini wrote: ${response}`, "success");
                    await page.waitForTimeout(500);
                    continue;
                }

                const optionEls = await question.$$('[role="radio"]');
                if (!optionEls.length) {
                    log("No input found, skipping.", "warn");
                    continue;
                }

                const options = [];
                for (const opt of optionEls) {
                    const label = (await opt.getAttribute("aria-label")) || (await opt.innerText()).trim();
                    options.push(label);
                }

                log(`Options: ${options.join(" | ")}`, "info");

                const answer = await askGemini(questionText, options);

                log(`Gemini says: ${answer}`, "ai");

                let clicked = false;
                for (const opt of optionEls) {
                    const label = (await opt.getAttribute("aria-label")) || (await opt.innerText()).trim();
                    if (answer.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(answer.toLowerCase())) {
                        await opt.click();
                        log(`Clicked: ${label}`, "success");
                        clicked = true;
                        break;
                    }
                }

                if (!clicked) log("WARNING: Could not match an option.", "warn");

                await page.waitForTimeout(500);
            }

            const nextButton = await page.$('text="Next"');
            const submitButton = await page.$('text="Submit"');

            if (nextButton) {
                log("Moving to next page...", "info");
                await nextButton.click();
                await page.waitForTimeout(2000);
                pageNum++;
            } else if (submitButton) {
                await submitButton.click();
                await page.waitForTimeout(2000);
                log("Form submitted successfully!", "done");
                break;
            } else {
                log("No Next or Submit button found. Stopping.", "warn");
                break;
            }
        }

        await context.close();
        log("DONE", "done");

    } catch (err) {
        log(`ERROR: ${err.message}`, "error");
    }

    res.end();
});

app.listen(3000, () => {
    console.log("Quiz Automation running at http://localhost:3000");
});