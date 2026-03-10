import { error, isHttpError } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import metascraper, { type Metadata } from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperImage from "metascraper-image";
import shopping from "$lib/server/shopping";
import { parseAcceptLanguageHeader } from "$lib/i18n";
import { getFormatter } from "$lib/server/i18n";
import { requireLoginOrError } from "$lib/server/auth";
import { logger } from "$lib/server/logger";
import { env } from "$env/dynamic/private";

const scraper = metascraper([shopping(), metascraperTitle(), metascraperImage()]);
type ProductDiagnostic = {
    fallback: true;
    reason: "captcha_blocked" | "fetch_failed" | "scraper_failed" | "playwright_failed";
    message: string;
    status?: number;
    stage?: "fetch" | "scrape";
    hostname: string;
};

const PLAYWRIGHT_HOSTS = new Set(
    (env.PRODUCT_SCRAPE_PLAYWRIGHT_HOSTS || "yuyu-tei.jp")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
);

const shouldUsePlaywright = (hostname: string) => {
    return (env.PRODUCT_SCRAPE_PLAYWRIGHT || "false") === "true" && PLAYWRIGHT_HOSTS.has(hostname.toLowerCase());
};

// const goShopping = async (targetUrl: URL, locales: string[]) => {
//     const resp = await fetch(targetUrl, {
//         headers: {
//             "user-agent":
//                 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
//             "accept-language": locales.join(",")
//         }
//     });
//     if (!resp.ok) {
//         throw new Error(`Unable to fetch url: ${resp.status}`);
//     }
//     const html = await resp.text();
//     const metadata = await scraper({ html, url: resp.url });
//     return metadata;
// };

const goShopping = async (targetUrl: URL, locales: string[]) => {
    const acceptLanguage =
    locales?.length
        ? [ "ja-JP,ja;q=0.9", ...locales ].join(",")
        : "ja-JP,ja;q=0.9,en;q=0.8";

    const resp = await fetch(targetUrl, {
    headers: {
        "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": acceptLanguage,
        "referer": "https://yuyu-tei.jp/",
        "upgrade-insecure-requests": "1"
    }
    });

    if (!resp.ok) throw new Error(`Unable to fetch url: ${resp.status}`);
    const html = await resp.text();
    return scraper({ html, url: resp.url });
};

const goShoppingWithPlaywright = async (targetUrl: URL, locales: string[]) => {
    let browser: { close: () => Promise<void> } | undefined;
    try {
        let chromium: any;
        try {
            chromium = (await import("playwright")).chromium;
        } catch {
            chromium = (await import("@playwright/test")).chromium;
        }
        if (!chromium) throw new Error("Playwright chromium not available");

        const wsEndpoint = env.PLAYWRIGHT_WS_ENDPOINT;
        browser = wsEndpoint
            ? await chromium.connect(wsEndpoint)
            : await chromium.launch({
                  headless: true,
                  args: ["--no-sandbox", "--disable-setuid-sandbox"]
              });

        const context = await browser.newContext({
            locale: locales[0] || "ja-JP",
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        });
        const page = await context.newPage();
        await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(1200);

        const html = await page.content();
        const metadata = await scraper({ html, url: page.url() });
        await context.close();
        return metadata;
    } finally {
        await browser?.close();
    }
};

const isCaptchaResponse = (metadata: Metadata) => {
    return metadata.image && metadata.image.toLocaleLowerCase().indexOf("captcha") >= 0;
};

const makeFallback = (targetUrl: URL, diagnostic: ProductDiagnostic) => {
    return new Response(
        JSON.stringify({
            url: targetUrl.toString(),
            _diagnostic: diagnostic
        })
    );
};

const getUrlOrError = async (url: string) => {
    const $t = await getFormatter();

    try {
        return new URL(url);
    } catch {
        error(400, $t("errors.valid-url-not-provided"));
    }
};

export const GET: RequestHandler = async ({ request, url }) => {
    await requireLoginOrError();
    const $t = await getFormatter();
    const encodedUrl = url.searchParams.get("url");
    const acceptLanguage = request.headers?.get("accept-language");
    const locales = parseAcceptLanguageHeader(acceptLanguage);

    if (encodedUrl) {
        try {
            const targetUrl = await getUrlOrError(encodedUrl);

            let metadata = await goShopping(targetUrl, locales);
            if (isCaptchaResponse(metadata) && metadata.url) {
                // retry with the resolved URL
                metadata = await getUrlOrError(metadata.url).then((url) => goShopping(url, locales));
            }
            if (isCaptchaResponse(metadata) && shouldUsePlaywright(targetUrl.hostname)) {
                try {
                    metadata = await goShoppingWithPlaywright(targetUrl, locales);
                } catch (pwErr) {
                    logger.warn({ pwErr, targetUrl: targetUrl.toString() }, "Playwright fallback failed after captcha");
                }
            }
            if (isCaptchaResponse(metadata)) {
                logger.warn({ targetUrl: targetUrl.toString() }, "Product metadata blocked by captcha, using fallback");
                return makeFallback(targetUrl, {
                    fallback: true,
                    reason: "captcha_blocked",
                    message: "This site blocked metadata extraction (captcha/anti-bot). Fill item details manually.",
                    stage: "scrape",
                    hostname: targetUrl.hostname
                });
            }

            if (metadata.url == metadata.image) {
                metadata.url = targetUrl.toString();
            }

            return new Response(JSON.stringify(metadata));
        } catch (err) {
            if (isHttpError(err)) {
                throw err;
            }

            logger.warn({ err, targetUrl: encodedUrl }, "Unable to fetch product metadata");
            const targetUrl = await getUrlOrError(encodedUrl);
            const errMsg = err instanceof Error ? err.message : String(err);
            const fetchStatus = errMsg.match(/Unable to fetch url: (\d+)/)?.[1];
            const status = fetchStatus ? Number.parseInt(fetchStatus) : undefined;

            if (status === 403 && shouldUsePlaywright(targetUrl.hostname)) {
                try {
                    const metadata = await goShoppingWithPlaywright(targetUrl, locales);
                    if (metadata.url == metadata.image) {
                        metadata.url = targetUrl.toString();
                    }
                    return new Response(JSON.stringify(metadata));
                } catch (pwErr) {
                    logger.warn({ pwErr, targetUrl: targetUrl.toString() }, "Playwright fallback failed after 403");
                    return makeFallback(targetUrl, {
                        fallback: true,
                        reason: "playwright_failed",
                        message:
                            "Remote site blocked direct fetch (403) and Playwright fallback failed. Fill item details manually.",
                        stage: "fetch",
                        status,
                        hostname: targetUrl.hostname
                    });
                }
            }

            return makeFallback(targetUrl, {
                fallback: true,
                reason: fetchStatus ? "fetch_failed" : "scraper_failed",
                message: fetchStatus
                    ? `Remote site returned HTTP ${fetchStatus} for metadata fetch. Fill item details manually.`
                    : "Unable to extract product metadata from this page. Fill item details manually.",
                stage: fetchStatus ? "fetch" : "scrape",
                status,
                hostname: targetUrl.hostname
            });
        }
    } else {
        error(400, $t("errors.must-specify-url-in-query-parameters"));
    }
};
