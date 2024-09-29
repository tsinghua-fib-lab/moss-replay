import { Layer } from "@deck.gl/core/typed";
import { LngLatBound } from "../type";

// 每个子播放器需要自行处理数据请求、帧转换和绘制
export interface IPlayer {
    init(): Promise<void>; // 初始化
    play(timing: number, interpolation: boolean, pickable: boolean, bound?: LngLatBound): Promise<Layer[]>; // 播放一帧
}
