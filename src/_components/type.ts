export interface LngLat {
    lng: number
    lat: number
}

export interface LngLatZoom {
    lng: number
    lat: number
    zoom: number
}

export interface LngLatBound {
    lat1: number;
    lat2: number;
    lng1: number;
    lng2: number;
}

export interface Sim {
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
