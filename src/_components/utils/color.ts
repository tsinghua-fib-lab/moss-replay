import tinycolor from "tinycolor2";

export type Color = [number, number, number, number];

export const toRGBA = (hex: string, alpha?: number): Color => {
    const rgba = tinycolor(hex).setAlpha(alpha ?? 1).toRgb();
    return [rgba.r, rgba.g, rgba.b, rgba.a * 255];
}