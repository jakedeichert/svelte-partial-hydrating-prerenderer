#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');
const servor = require('servor');

const prerenderConfig = require(path.join(
    process.cwd(),
    'prerender.config.js'
));

const PORT = prerenderConfig.port || 8080;

(async () => {
    // Serve so that headless chrome can load and render it
    await servor({
        root: prerenderConfig.serve,
        fallback: 'index.html',
        port: PORT,
        reload: false,
    });
    console.info(`Server running`);

    console.info(`Starting prerender phase...`);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    // page.setViewport({ width: 1920, height: 1080 });

    // Set a global variable so the app can understand it's in prerender mode
    await page.evaluateOnNewDocument(() => {
        window.__PRERENDER_MODE__ = true;
    });

    // Run custom page init logic
    prerenderConfig.onPageInit && (await prerenderConfig.onPageInit(page));

    // Grab content of every page
    for (const p of prerenderConfig.pages) {
        const url = `http://localhost:${PORT}${p.path}`;
        await page.goto(url, { waitUntil: 'networkidle0' });

        // Run page plugins
        if (prerenderConfig.plugins) {
            await runPlugins(page, prerenderConfig.plugins);
        }

        p.content = await page.content();
    }

    // Save each page
    await Promise.all(
        prerenderConfig.pages.map(async p => {
            const fileName = p.output || path.join(p.path, 'index.html');
            const outputPath = path.join(prerenderConfig.output, fileName);
            await makeDir(outputPath);
            return fs.writeFile(outputPath, p.content);
        })
    );

    await browser.close();
    console.log(`Prerender complete`);
    process.exit(0);
})();

async function makeDir(outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
}

async function runPlugins(page, plugins) {
    for (const p of plugins) {
        await page.evaluate(p);
    }
}
