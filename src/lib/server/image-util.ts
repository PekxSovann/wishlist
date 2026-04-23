import sharp from "sharp";
import { unlink } from "fs/promises";
import { logger } from "$lib/server/logger";
import { getRequestEvent } from "$app/server";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { finished } from "stream/promises";
import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const DEFAULT_MAX_IMAGE_SIZE = 5000000;
export const ITEM_MAX_IMAGE_SIZE = 1000000;

const slugify = (str: string) => {
    return str
        .normalize("NFKD") // split accented characters into their base characters and diacritical marks
        .replace(/[\u0300-\u036f]/g, "") // remove all the accents, which happen to be all in the \u03xx UNICODE block.
        .trim() // trim leading or trailing whitespace
        .toLowerCase() // convert to lowercase
        .replace(/[^a-z0-9 -]/g, "") // remove non-alphanumeric characters
        .replace(/\s+/g, "-") // replace spaces with hyphens
        .substring(0, 64) // trim to a reasonable file name limit
        .replace(/-+/g, "-"); // remove consecutive hyphens
};

const fetchImage = async (imageUrl: string) => {
    try {
        const url = new URL(imageUrl);
        const resp = await getRequestEvent().fetch(url);
        if (resp.ok && resp.body) {
            return Readable.fromWeb(resp.body as unknown as NodeReadableStream);
        } else {
            return null;
        }
    } catch {
        return null;
    }
};

export const getMaxImageSize = () => {
    return env.MAX_IMAGE_SIZE
        ? Number.parseInt(env.MAX_IMAGE_SIZE) || DEFAULT_MAX_IMAGE_SIZE
        : DEFAULT_MAX_IMAGE_SIZE;
};

export const isValidImage = (image: File, maxImageSize = getMaxImageSize()) => {
    return image.size > 0 && image.size <= maxImageSize;
};

export const createImage = async (filename: string, image: File | string | null | undefined) => {
    if (!image) {
        return null;
    }

    let dataStream: Readable;
    if (typeof image === "string") {
        const res = await fetchImage(image);
        if (res) {
            dataStream = res;
        } else {
            return null;
        }
    } else if (isValidImage(image)) {
        dataStream = Readable.fromWeb(image.stream() as unknown as NodeReadableStream);
    } else {
        return null;
    }

    try {
        const chunks: Buffer[] = [];
        dataStream.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        await finished(dataStream);

        const webp = await sharp(Buffer.concat(chunks)).rotate().resize(300).webp().toBuffer();
        return `data:image/webp;base64,${webp.toString("base64")}`;
    } catch (err) {
        logger.error({ err, filename: slugify(filename) }, "Unable to process image");
    }

    error(422, "Unable to process image");
};

export const deleteImage = async (filename: string): Promise<void> => {
    try {
        await unlink(`uploads/${filename}`);
    } catch (err) {
        logger.warn({ err }, "Unable to delete file: %s", filename);
    }
};

export const tryDeleteImage = async (imageUrl: string): Promise<void> => {
    try {
        new URL(imageUrl);
    } catch {
        await deleteImage(imageUrl);
    }
};
