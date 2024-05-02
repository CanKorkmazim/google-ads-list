import puppeteer, {type Page} from 'puppeteer';
import fs from "node:fs"
import cliColor from "cli-color"
import moment from "moment"
import * as path from "path";
import slug from "slug"

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

type SettingsType = {
    "words": string[]
    "words_timeout_ms": number
    "idle_timeout_ms": number
    "pages_timeout_ms": number
    "global_timeout_ms": number
    "selectors": {
        "search": string
        "link": string
        "linkAttribute": string
        "title": string
        "description": string
    },
    "browser": {
        "userAgent": string
    }
}

const settings: SettingsType = JSON.parse(fs.readFileSync('./settings.json').toString())

async function main() {
    try {

        log(`${cliColor.cyan(`Started with, ${JSON.stringify(settings)}`)}`)

        log(cliColor.whiteBright(`Scan starting`))

        const browser = await puppeteer.launch({
            args: [
                "--fast-start",
                "--disable-extensions",
                "--no-sandbox",
                '--disable-setuid-sandbox',
                "--disable-web-security",
                "--start-maximized",
                //`--proxy-server=${proxy.host}:${proxy.port}`
            ],
            headless: true,
            ignoreHTTPSErrors: true,
            defaultViewport: null,
            // executablePath: path.resolve('chrome-win', 'chrome.exe')
        });
        const pages = await browser.pages();
        const page = pages[0];

        page.setDefaultNavigationTimeout(settings.global_timeout_ms);
        page.setDefaultTimeout(settings.global_timeout_ms)

        for (let word of settings.words) {
            log(`[${cliColor.whiteBright(word)}] ${cliColor.cyan(`Scanning`)}`)


            const searchInputSelector = settings.selectors.search;

            await page.setUserAgent(settings.browser.userAgent)
            await page.goto('https://www.google.com.tr/')

            const searchElement = await page.waitForSelector(searchInputSelector, {visible: true})
            await searchElement.type(word)

            await Promise.all([
                page.waitForNavigation({waitUntil: "domcontentloaded"}),
                page.keyboard.press("Enter"),
            ]);

            const searchResults = await getList(page)

            if (!searchResults || !searchResults.length) {
                log(`[${cliColor.whiteBright(word)}] ${cliColor.yellowBright(`No result`)}`)
                continue
            }

            log(`[${cliColor.whiteBright(word)}] ${cliColor.cyan(`Scan complete`)}`)
            try {
                fs.writeFileSync(path.resolve(`${slug(word)}.json`), JSON.stringify(searchResults, null, 2))
                log(`[${cliColor.whiteBright(word)}] File saved ${slug(word)}.json`)
            } catch {
                log(`[${cliColor.whiteBright(word)}] File write failed ${slug(word)}.json`)
            }

            if (settings.words[settings.words.indexOf(word) + 1]) {
                log(`${cliColor.cyan(`Delay for next word ${settings.words_timeout_ms}`)}`)
                await sleep(settings.words_timeout_ms);
            }
        }

        // console.dir(searchResults, {depth: null})

        await browser.close()


    } catch (e) {
        if (e.message.includes('Failed to launch the browser process! spawn')) log(`${cliColor.redBright(`Browser failed`)}`)

        else {
            log(`${cliColor.redBright(`Unknown error`)}`)
            console.log(e)
        }
    }
    return await keypress()
}

function log(text: string) {
    console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] - ${text}`);
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function keypress() {
    if (!process.stdin.setRawMode) return;

    console.log("Press any key for exit")
    process.stdin.setRawMode(true)
    return new Promise(resolve => process.stdin.once('data', () => {
        process.stdin.setRawMode(false)
        resolve(1)
    }))
}

async function getList(page: Page) {
    await page.waitForNavigation({waitUntil: "domcontentloaded"});
    return await page.evaluate(function (settings) {
        console.log(settings)
        let list = []
        try {
            document.querySelectorAll(`[data-text-ad="1"]`).forEach((e: any) => {
                let link = e.querySelector(settings.selectors.link);
                let title = e.querySelector(settings.selectors.title)
                let description = e.querySelector(settings.selectors.description)

                list.push({
                    link: link ? link.getAttribute(settings.selectors.linkAttribute) : null,
                    title: title ? title.innerText : null,
                    description: description ? description.innerText : null
                })

            })
        } catch (e) {
        }

        return list
    }, settings)
}

main().then(process.exit)