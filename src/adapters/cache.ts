// ---------------------------------------------------------------------------
// Generic TTL cache – wraps async adapter calls
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
    data: T;
    expires: number;
}

export class TTLCache {
    private store = new Map<string, CacheEntry<any>>();
    private defaultTTL: number;

    constructor(defaultTTLMs: number = 60_000) {
        this.defaultTTL = defaultTTLMs;
    }

    async get<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
        const cached = this.store.get(key);
        if (cached && cached.expires > Date.now()) {
            return cached.data as T;
        }

        const data = await fetcher();
        this.store.set(key, {
            data,
            expires: Date.now() + (ttl ?? this.defaultTTL),
        });
        return data;
    }

    invalidate(key: string): void {
        this.store.delete(key);
    }

    invalidatePrefix(prefix: string): void {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) {
                this.store.delete(key);
            }
        }
    }

    clear(): void {
        this.store.clear();
    }
}

export const infraCache = new TTLCache(60_000);
