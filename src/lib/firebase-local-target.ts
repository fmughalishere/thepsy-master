const STORAGE_KEY = "thepsy_localhost_firebase_target";

export type LocalhostFirebaseTarget = "debug" | "production";

/** True when running the Vite dev server in a browser on this machine (not LAN preview of prod build). */
export function isDevelLocalhost(): boolean {
    return (
        import.meta.env.DEV &&
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "[::1]")
    );
}

export function getLocalhostFirebaseTarget(): LocalhostFirebaseTarget {
    if (!isDevelLocalhost()) return "debug";
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "production" ? "production" : "debug";
}

export function setLocalhostFirebaseTarget(target: LocalhostFirebaseTarget): void {
    window.localStorage.setItem(STORAGE_KEY, target);
}

export function reloadWithNewFirebaseTarget(target: LocalhostFirebaseTarget): void {
    setLocalhostFirebaseTarget(target);
    window.location.reload();
}
