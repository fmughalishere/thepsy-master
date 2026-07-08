const puppeteer = require('puppeteer');
const fs = require('fs');

async function runVerification() {
    console.log("Starting verification...");
    const browser = await puppeteer.launch({ headless: false }); // Headless false so user can see it if they want
    const page = await browser.newPage();

    // Viewport size
    await page.setViewport({ width: 1280, height: 800 });

    try {
        // 1. Login
        console.log("Navigating to login...");
        await page.goto('http://localhost:8087/login', { waitUntil: 'networkidle0' });

        console.log("Filling credentials...");
        await page.type('input[type="email"]', 'therapist@gmail.com');
        await page.type('input[type="password"]', '12345678');

        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0' })
        ]);
        console.log("Logged in.");

        // Wait for dashboard to settle
        await new Promise(r => setTimeout(r, 2000));

        // 2. Define languages to test
        const languages = ['de', 'hr', 'el'];
        const sectionsToCheck = [
            { name: "dashboard", url: "http://localhost:8087/therapist/dashboard" },
            { name: "profile", url: "http://localhost:8087/therapist/complete-profile" }
            // Add more if needed
        ];

        // Ensure screenshot directory
        if (!fs.existsSync('verification_screenshots')) {
            fs.mkdirSync('verification_screenshots');
        }

        // 3. Iterate languages
        for (const lang of languages) {
            console.log(`Testing language: ${lang}`);

            // Change language via LocalStorage or I18n
            await page.evaluate((l) => {
                localStorage.setItem('i18nextLng', l);
                // Also try to force reload to pick up change
            }, lang);

            // Reload to apply language
            await page.reload({ waitUntil: 'networkidle0' });
            await new Promise(r => setTimeout(r, 1000)); // Wait for translation to load

            for (const section of sectionsToCheck) {
                console.log(`Checking ${section.name} in ${lang}...`);
                await page.goto(section.url, { waitUntil: 'networkidle0' });
                await new Promise(r => setTimeout(r, 1500)); // Wait for render

                const screenshotPath = `verification_screenshots/${lang}_${section.name}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`Saved screenshot: ${screenshotPath}`);

                // Extract text for verification
                const textData = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText || document.querySelector('h2')?.innerText || "";
                    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText);
                    const labels = Array.from(document.querySelectorAll('label')).map(l => l.innerText);
                    return { title, buttons, labels };
                });

                console.log(`[${lang}] ${section.name} Text Sample:`, JSON.stringify(textData).substring(0, 200) + "...");
            }
        }

        console.log("Verification finished successfully.");

    } catch (e) {
        console.error("Verification failed:", e);
    } finally {
        await browser.close();
    }
}

runVerification();
