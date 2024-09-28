import { Fetcher, Frame } from "../Fetcher";
import { LngLatBound } from "../type";
import { Layer } from '@deck.gl/core/typed';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers/typed';
import { CylinderGeometry } from '@luma.gl/engine';
import { IPlayer } from "./interface";

// 原始响应
export interface PedestrianRaw {
    id: number;
    step: number;
    lat: number;
    lng: number;
    parentId: number;
    direction: number;
    v: number;
}

export class PedestrianPlayer implements IPlayer {
    onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: PedestrianRaw[] }>;
    fetcher: Fetcher = new Fetcher(3, 3);

    constructor(onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: PedestrianRaw[] }>) {
        this.onFetch = onFetch;
    }

    async init() {
    }

    createRequests(startStep: number, prefetchNum: number, prefetchLength: number, bound?: LngLatBound) {
        const reqs: Frame[] = [];
        // 根据prefetchNum创建一系列请求并加入fetcher中
        for (let i = 0; i < prefetchNum; i++) {
            const begin = startStep + i * prefetchLength;
            const end = begin + prefetchLength;
            reqs.push({
                startStep: begin, endStep: end,
                promise: this.onFetch(begin, end, bound),
            });
        }
        return reqs;
    }

    async ready(t: number, bound: LngLatBound): Promise<void> {
        await this.fetcher.fetch(t, t + 2, (t: number, prefetchNum: number, prefetchLength: number) => {
            return this.createRequests(t, prefetchNum, prefetchLength, bound);
        });
    }

    play(t: number, pickable: boolean): Layer[] {
        const res = this.fetcher.getWhenPlay(t, t + 2) as PedestrianRaw[][];
        const [f1, f2] = res;
        // 第2帧转为map
        const f2Id2Raw: Map<number, PedestrianRaw> = new Map();
        for (const car of f2) {
            f2Id2Raw.set(car.id, car);
        }
        // 计算插值比例
        const ratio = t - Math.floor(t);

        const data = [];
        // 计算当前帧要呈现的所有人的位置
        for (const p of f1) {
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