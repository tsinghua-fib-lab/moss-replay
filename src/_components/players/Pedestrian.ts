import { Fetcher, Frame, FrameGroup } from "../Fetcher";
import { LngLatBound } from "../type";
import { Layer } from '@deck.gl/core/typed';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers/typed';
import { CylinderGeometry } from '@luma.gl/engine';
import { IPlayer } from "./interface";

// 原始响应
export interface Pedestrian {
    id: number;
    lat: number;
    lng: number;
    parentId: number;
    direction: number;
    v: number;
}

export interface PedestrianFrame extends Frame {
    data: Pedestrian[];
}

export class PedestrianPlayer implements IPlayer {
    onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<PedestrianFrame[]>;
    fetcher: Fetcher;

    constructor(
        onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<PedestrianFrame[]>,
        dtHint?: number,
    ) {
        this.onFetch = onFetch;
        this.fetcher = new Fetcher("ped", dtHint ?? 1, 3);
    }

    async init() {
    }

    createRequests(startStep: number, prefetchNum: number, prefetchLength: number, bound?: LngLatBound) {
        const reqs: FrameGroup[] = [];
        // 根据prefetchNum创建一系列请求并加入fetcher中
        for (let i = 0; i < prefetchNum; i++) {
            const begin = startStep + i * prefetchLength;
            const end = begin + prefetchLength;
            reqs.push({
                startT: begin, endT: end,
                promise: this.onFetch(begin, end, bound),
            });
        }
        return reqs;
    }

    async play(t: number, interpolation: boolean, pickable: boolean, bound?: LngLatBound): Promise<Layer[]> {
        const res = await this.fetcher.fetch(t, (t: number, prefetchNum: number, prefetchLength: number) => {
            return this.createRequests(t, prefetchNum, prefetchLength, bound);
        }) as PedestrianFrame[];
        if (res.length === 0) {
            console.log("PedestrianPlayer: no data");
            return [];
        }
        const f1: PedestrianFrame = res[0];
        const f2: PedestrianFrame = res[res.length - 1];
        console.log(`PedestrianPlayer: play at ${t}, f1.t=${f1.t}, f2.t=${f2.t}`);

        // 第2帧转为map
        const f2Id2Raw: Map<number, Pedestrian> = new Map();
        for (const p of f2.data) {
            f2Id2Raw.set(p.id, p);
        }
        // 计算插值比例
        const ratio = (f2.t > f1.t && interpolation) ? (t - f1.t) / (f2.t - f1.t) : 0;

        const data = [];
        // 计算当前帧要呈现的所有人的位置
        for (const p of f1.data) {
            let { lng, lat, v } = p;
            // 检查第二帧
            const f2 = f2Id2Raw.get(p.id);
            if (f2) {
                const { lng: lng2, lat: lat2 } = f2;
                lng = lng * (1 - ratio) + lng2 * ratio;
                lat = lat * (1 - ratio) + lat2 * ratio;
                v = v * (1 - ratio) + f2.v * ratio;
            }
            data.push({ id: p.id, position: [lng, lat, 1.7 / 2], angle: p.direction, v: v });
        }
        const layer = new SimpleMeshLayer({
            id: 'pedestrian',
            data: data,
            mesh: new CylinderGeometry({ radius: 0.5, height: 1.7, verticalAxis: 'z', bottomCap: true }),
            getPosition: d => d.position,
            getColor: [255, 0, 0],
            // getOrientation: d => [0, d.angle, 0]
            pickable: pickable,
        });
        return [layer];
    }
}