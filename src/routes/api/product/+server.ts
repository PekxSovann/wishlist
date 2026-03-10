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

const scraper = metascraper([shopping(), metascraperTitle(), metascraperImage()]);

const goShopping = async (targetUrl: URL, locales: string[]) => {
    const resp = await fetch(targetUrl, {
        headers: {
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "accept-language": locales.join(",")
        }
    });
    if (!resp.ok) {
        throw new Error(`Unable to fetch url: ${resp.status}`);
    }
    const html = await resp.text();
    const metadata = await scraper({ html, url: resp.url });
    return metadata;
};

const isCaptchaResponse = (metadata: Metadata) => {
    return metadata.image && metadata.image.toLocaleLowerCase().indexOf("captcha") >= 0;
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
            if (isCaptchaResponse(metadata)) {
                error(424, $t("errors.product-information-not-available"));
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
            error(424, $t("errors.product-information-not-available"));
        }
    } else {
        error(400, $t("errors.must-specify-url-in-query-parameters"));
    }
};
