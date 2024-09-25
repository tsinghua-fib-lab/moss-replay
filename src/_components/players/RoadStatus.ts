import { message } from "antd";
import { Fetcher, Frame } from "../Fetcher";
import { LngLatBound } from "../type";
import { Color, toRGBA } from "../utils/color";
import { Layer } from '@deck.gl/core/typed';
import { GeoJsonLayer } from '@deck.gl/layers/typed';
import { IPlayer } from "./interface";

// 信控原始响应
export type RoadStatusRaw = {
    id: number,
    step: number,
    level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
}

export type RoadStatusResponse = RoadStatusRaw[];

const ALPHA = 0.5;
const LEVEL_COLORS = [
    toRGBA('#2e8b57', ALPHA), // 0-未加载
    toRGBA('#32cd32', ALPHA), // 1-畅通
    toRGBA('#eeee00', ALPHA), // 2-基本畅通
    toRGBA('#aa0000', ALPHA), // 3-轻度拥堵
    toRGBA('#800000', ALPHA), // 4-中度拥堵
    toRGBA('#600000', ALPHA), // 5-严重拥堵
    toRGBA('#7d8597', ALPHA), // 6-限行
];

export class RoadStatusPlayer implements IPlayer {
    onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: RoadStatusResponse }>;
    geoJsonData: GeoJSON.Feature[];
    fetcher: Fetcher = new Fetcher(3, 3);

    constructor(
        onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: RoadStatusResponse }>,
        roadGeoJson: GeoJSON.Feature[],
    ) {
        this.onFetch = onFetch;
        this.geoJsonData = roadGeoJson;
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
        await this.fetcher.fetch(t, t + 1, (timing: number, prefetchNum: number, prefetchLength: number) => {
            return this.createRequests(timing, prefetchNum, prefetchLength, bound);
        });
    }

    play(t: number, pickable: boolean): Layer[] {
        if (this.geoJsonData === undefined) {
            return [];
        }
        // 格式转换并绘制路网
        const res = this.fetcher.getWhenPlay(t, t + 1)[0] as RoadStatusResponse;
        const id2Color = new Map<number, Color>();
        for (const road of res) {
            id2Color.set(road.id, LEVEL_COLORS[road.level]);
        }
        const data = this.geoJsonData.map(f => {
            const id = f.properties?.id ?? f.id;
            if (id === undefined) {
                console.error("RoadStatusPlayer: 未找到id");
                return f;
            }
            if (f.properties) {
                f.properties.color = id2Color.get(id) || [0, 0, 0, 0];
            } else {
                f.properties = { color: id2Color.get(id) || [0, 0, 0, 0] };
            }
            return f;
        });
        const layer = new GeoJsonLayer({
            id: 'road-status',
            data: data,
            stroked: true,
            filled: true,
            extruded: false,
            lineWidthScale: 10,
            lineWidthMinPixels: 2,
            getLineColor: (f: any) => f.properties.color,
            getFillColor: (f: any) => f.properties.color,
            pickable: pickable,
        });
        return [layer];
    }
}