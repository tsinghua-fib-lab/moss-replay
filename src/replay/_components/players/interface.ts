import { Layer } from "@deck.gl/core/typed";
import { LngLatBound } from "../type";

// 每个子播放器需要自行处理数据请求、帧转换和绘制
export interface IPlayer {
    init(): Promise<void>; // 初始化
    ready(timing: number, bound?: LngLatBound): Promise<void>; // 等待指定时间的数据准备完毕
    play(timing: number, pickable: boolean): Layer[]; // 播放一帧
}
