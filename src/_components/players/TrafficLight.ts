import { Fetcher, Frame, FrameGroup } from "../Fetcher";
import { LngLatBound } from "../type";
import { Color, toRGBA } from "../utils/color";
import { message } from "antd";
import { Layer } from '@deck.gl/core/typed';
import { GeoJsonLayer } from '@deck.gl/layers/typed';
import { IPlayer } from "./interface";

// 信控原始响应
export interface TL {
    id: number;
    state: 0 | 1 | 2 | 3;
}

export interface TLFrame extends Frame {
    data: TL[];
}

const ALPHA = 0.5;
const STATE_COLORS = [
    toRGBA('#ffffff', ALPHA), // 0-无信控
    toRGBA('#ff0000', ALPHA), // 1-红灯
    toRGBA('#00ff00', ALPHA), // 2-绿灯
    toRGBA('#ffff00', ALPHA), // 3-黄灯
];

export class TLPlayer implements IPlayer {
    onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<TLFrame[]>;
    geoJsonData: GeoJSON.Feature[];
    fetcher: Fetcher;

    constructor(
        onFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<TLFrame[]>,
        junctionLaneGeoJson: GeoJSON.Feature[],
        dtHint?: number,
    ) {
        this.onFetch = onFetch;
        this.geoJsonData = junctionLaneGeoJson;
        this.fetcher = new Fetcher(dtHint ?? 1, 3);
    }

    async init() {
    }

    updateGeoJson(geoJson: GeoJSON.Feature[]) {
        this.geoJsonData = geoJson;
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
        await this.fetcher.fetch(t, (timing: number, prefetchNum: number, prefetchLength: number) => {
            return this.createRequests(timing, prefetchNum, prefetchLength, bound);
        });
    }

    play(t: number, pickable: boolean): Layer[] {
        if (this.geoJsonData === undefined) {
            return [];
        }
        // 格式转换并绘制路网
        const frames = this.fetcher.getWhenPlay(t) as TLFrame[];
        if (frames.length === 0) {
            console.log("TLPlayer: no data");
            return [];
        }
        const res = frames[0].data;
        console.log(`TLPlayer: play at ${t}, f1.t=${frames[0].t}`);

        const id2Color = new Map<number, Color>();
        for (const tl of res) {
            id2Color.set(tl.id, STATE_COLORS[tl.state]);
        }
        // 为所有数据写入颜色属性
        const data = this.geoJsonData.map(f => {
            const id = f.properties?.id ?? f.id;
            if (id === undefined) {
                message.error("TLPlayer: 未找到id属性");
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
            id: 'tl',
            data: data,
            stroked: true,
            filled: true,
            extruded: false,
            lineWidthScale: 1,
            lineWidthMinPixels: 1,
            getLineColor: (f: any) => f.properties.color,
            getFillColor: (f: any) => f.properties.color,
            pickable: pickable,
        });
        return [layer];
    }
}