export function randFromTo(from: number, to: number): number {
    return Math.random() * (to - from) + from;
}

export function normAngle(angle: number): number {
    const t = 2 * Math.PI;
    return ((angle % t) + t) % t
}

// 角度插值
export function angleInterp(ang1: number, ang2: number, percentage: number): number {
    let delta = normAngle(ang2 - ang1);
    if (delta > Math.PI) delta = delta - Math.PI * 2;
    return ang1 + delta * percentage;
}
