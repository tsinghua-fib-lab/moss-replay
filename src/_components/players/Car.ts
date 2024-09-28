import { Fetcher, Frame, FrameGroup } from "../Fetcher";
import { LngLatBound } from "../type";
import { Layer } from '@deck.gl/core/typed';
import { ScenegraphLayer } from '@deck.gl/mesh-layers/typed';
import { IPlayer } from "./interface";
import { angleInterp } from "../utils/math";

// 车辆原始响应
export interface Car {
    id: number;
    lat: number;
    lng: number;
    laneId: number;
    direction: number;
    v: number;
    model: string;
}

export interface CarFrame extends Frame {
    data: Car[];
}

export class CarPlayer implements IPlayer {
    onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<CarFrame[]>;
    fetcher: Fetcher;
    modelPaths: { [model: string]: string };
    defaultModelPath: string;

    constructor(
        onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<CarFrame[]>,
        modelPaths: { [model: string]: string },
        defaultModelPath: string,
        dtHint?: number,
    ) {
        this.onFetch = onFetch;
        this.modelPaths = modelPaths;
        this.defaultModelPath = defaultModelPath;
        this.fetcher = new Fetcher(3, 3, dtHint ?? 1);
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
        await this.fetcher.fetch(t, t + 2, (t: number, prefetchNum: number, prefetchLength: number) => {
            return this.createRequests(t, prefetchNum, prefetchLength, bound);
        });
    }

    play(t: number, pickable: boolean): Layer[] {
        const res = this.fetcher.getWhenPlay(t) as CarFrame[];
        if (res.length === 0) {
            return [];
        }
        const f1: CarFrame = res[0];
        const f2: CarFrame = res[res.length - 1];

        // 第2帧转为map
        const f2Id2Raw: Map<number, Car> = new Map();
        for (const car of f2.data) {
            f2Id2Raw.set(car.id, car);
        }
        // 计算插值比例
        const ratio = f2.t > f1.t ? (t - f1.t) / (f2.t - f1.t) : 0;

        const data: { [model: string]: { id: number, position: [number, number, number], angle: number, v: number }[] } = {};
        // 计算当前帧要呈现的所有车的位置
        for (const p of f1.data) {
            let { lng, lat, direction, v } = p;
            // 检查第二帧
            const f2 = f2Id2Raw.get(p.id);
            if (f2) {
                const { lng: lng2, lat: lat2 } = f2;
                lng = lng * (1 - ratio) + lng2 * ratio;
                lat = lat * (1 - ratio) + lat2 * ratio;
                direction = angleInterp(direction, f2.direction, ratio);
                v = v * (1 - ratio) + f2.v * ratio;
            }
            // 如果p.model在MODEL_PATHS中不存在，则使用默认模型（将model改为""）
            if (!(p.model in this.modelPaths)) {
                p.model = "";
            }
            data[p.model] = data[p.model] || [];
            data[p.model].push({ id: p.id, position: [lng, lat, 0], angle: direction, v: v });
        }

        const layers = Object.keys(data).map((model) => {
            const layer = new ScenegraphLayer({
                id: `car-${model}`,
                data: data[model],
                scenegraph: this.modelPaths[model] ?? this.defaultModelPath,
                getPosition: d => d.position,
                getOrientation: d => [0, d.angle * 180 / Math.PI, 0],
                _animations: {
                    '*': { speed: 5 }
                },
                sizeScale: 1,
                _lighting: 'pbr',
                pickable: pickable,
            });
            return layer;
        });
        return layers;
    }
}