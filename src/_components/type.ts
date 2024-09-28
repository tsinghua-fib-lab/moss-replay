export interface LngLat {
    lng: number
    lat: number
}

export interface LngLatBound {
    lat1: number;
    lat2: number;
    lng1: number;
    lng2: number;
}

export interface SimRaw {
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
