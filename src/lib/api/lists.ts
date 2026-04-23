import type { listItemsUpdateSchema } from "$lib/server/validations";
import { z } from "zod";

export class ListAPI {
    private listId: string;
    constructor(listId: string) {
        this.listId = listId;
    }

    _makeRequest = async (method: string, path: string, data?: Record<string, any>) => {
        const options: RequestInit = {
            method,
            headers: {
                "content-type": "application/json",
                accept: "application/json"
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const url = `/api/lists/${this.listId}${path}`;
        return await fetch(url, options);
    };

    makePublic = async () => {
        return await this._makeRequest("PATCH", "", { public: true });
    };

    makePrivate = async () => {
        return await this._makeRequest("PATCH", "", { isPrivate: true });
    };

    updateItems = async (data: z.infer<typeof listItemsUpdateSchema>[]) => {
        return await this._makeRequest("PATCH", "/items", data);
    };
}

export class ListItemAPI {
    private listId: string;
    private itemId: string;

    constructor(listId: string, itemId: string) {
        this.listId = listId;
        this.itemId = itemId;
    }

    _makeRequest = async (method: string, path: string = "/", data?: Record<string, any>) => {
        const options: RequestInit = {
            method,
            headers: {
                "content-type": "application/json",
                accept: "application/json"
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const url = `/api/lists/${this.listId}/items/${this.itemId}${path}`;
        return await fetch(url, options);
    };

    delete = async () => {
        return await this._makeRequest("DELETE");
    };

    approve = async () => {
        return await this._makeRequest("PATCH", "/", { approved: true });
    };

    deny = async () => {
        return await this._makeRequest("DELETE");
    };

    claim = async (
        claimedById: string,
        quantity: number,
        claimedPrice?: number | null,
        claimedCurrency?: string | null,
        claimedNote?: string | null
    ) => {
        return await this._makeRequest("PUT", "/claims", { claimedById, quantity, claimedPrice, claimedCurrency, claimedNote });
    };

    claimPublic = async (
        publicClaimedById: string,
        quantity: number,
        claimedPrice?: number | null,
        claimedCurrency?: string | null,
        claimedNote?: string | null
    ) => {
        return await this._makeRequest("PUT", "/claims", {
            publicClaimedById,
            quantity,
            claimedPrice,
            claimedCurrency,
            claimedNote
        });
    };
}
