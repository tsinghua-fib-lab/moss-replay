import { Fetcher, Frame, FrameGroup } from "../Fetcher";
import { LngLatBound } from "../type";
import { Layer } from '@deck.gl/core/typed';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers/typed';
import { CylinderGeometry } from '@luma.gl/engine';
import { IPlayer } from "./interface";

// 原始响应
export interface PedestrianRaw {
    id: number;
    lat: number;
    lng: number;
    parentId: number;
    direction: number;
    v: number;
}

export interface PedestrianFrame extends Frame {
    data: PedestrianRaw[];
}

export class PedestrianPlayer implements IPlayer {
    onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<PedestrianFrame[]>;
    fetcher: Fetcher = new Fetcher(3, 3);

    constructor(onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<PedestrianFrame[]>) {
        this.onFetch = onFetch;
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

    async ready(t: number, bound: LngLatBound): Promise<void> {
        await this.fetcher.fetch(t - 1, t + 2, (t: number, prefetchNum: number, prefetchLength: number) => {
            return this.createRequests(t, prefetchNum, prefetchLength, bound);
        });
    }

    play(t: number, pickable: boolean): Layer[] {
        const res = this.fetcher.getWhenPlay(t) as PedestrianFrame[];
        if (res.length === 0) {
            return [];
        }
        const f1: PedestrianFrame = res[0];
        const f2: PedestrianFrame = res[res.length - 1];

        // 第2帧转为map
        const f2Id2Raw: Map<number, PedestrianRaw> = new Map();
        for (const p of f2.data) {
            f2Id2Raw.set(p.id, p);
        }
        // 计算插值比例
        const ratio = f2.t > f1.t ? (t - f1.t) / (f2.t - f1.t) : 0;

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