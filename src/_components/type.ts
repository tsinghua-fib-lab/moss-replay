export type LngLatBound = {
    lat1: number;
    lat2: number;
    lng1: number;
    lng2: number;
}

export type SimRaw = {
    name: string;
    start: number;
    steps: number;
}

export interface MessageHandler {
    success: (message: string, duration: number) => void
    info: (message: string, duration: number) => void
    warning: (message: string, duration: number) => void
    error: (message: string, duration: number) => void
}
