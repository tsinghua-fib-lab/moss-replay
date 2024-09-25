// 轮询框架
// 实现目标：维护一个请求-响应队列（Promise），队列的元素按照可视化时间排列，后面的请求的起始step一定是前一个请求的结束step，上层应用可以从队列中取出响应，进行后续的渲染处理。

import { Queue } from "js-sdsl";

export type Frame = {
    startStep: number;
    endStep: number;
    promise: Promise<{data: any}>; // HTTP请求
}

interface IData {
    step: number;
}

export class Fetcher {
    q: Queue<Frame> = new Queue();
    nextStep?: number; // 下一个请求的起始step

    prefetchNum: number; // 预取的未来数据数量
    prefetchLength: number; // 预取的未来数据steps长度

    curData?: IData[]; // 在ready中读取到的当前帧数据，省得play再去查询一次
    step2Data: Map<number, IData[]> = new Map(); // 记录每个offset对应的数据，用于play时直接获取（对curData的进一步转换）

    constructor(prefetchNum: number, prefetchLength: number) {
        this.prefetchNum = prefetchNum;
        this.prefetchLength = prefetchLength;
    }

    // 上层应用发起一个请求
    private push(frame: Frame) {
        // 对startStep和endStep进行检查
        if (this.nextStep !== undefined && frame.startStep !== this.nextStep) {
            console.warn("Fetcher: 请求的起始step不正确, 期望: " + this.nextStep + ", 实际: " + frame.startStep);
        }
        this.nextStep = frame.endStep;
        this.q.push(frame);
    }

    // 为上层应用找到一个满足条件的请求
    private pop(t: number) {
        while (this.q.size() > 0) {
            const frame = this.q.front();
            if (frame === undefined) {
                break;
            }
            if (frame.startStep <= t && t < frame.endStep) {
                return frame;
            } else {
                this.q.pop();
            }
        }
    }

    // 预读区间[start, end)的数据，注意start会被下整，end会被上整
    async fetch(start: number, end: number, createRequests: (t: number, prefetchNum: number, prefetchLength: number) => Frame[]) {
        start = Math.floor(start);
        end = Math.ceil(end);
        const prefetchLength = Math.max(this.prefetchLength, end - start);
        // 如果step2Data已经包含了[start, end]的数据，则不需要再发请求
        let i = start;
        for (; i < end; i++) {
            if (this.step2Data.has(i)) {
                continue;
            }
            // 发现查不到i的数据了，则先试图从队列里取
            const f = this.pop(i);
            // 对f进行解析，肯定能覆盖i
            if (f !== undefined) {
                const newData = (await f.promise).data as IData[];
                for (let j = f.startStep; j < f.endStep; j++) {
                    this.step2Data.set(j, []);
                }
                for (const d of newData) {
                    this.step2Data.get(d.step)!.push(d);
                }
            } else {
                // 如果队列里也没有，则需要发请求
                // 如果发现当前的t不在fetcher里面的期望的下一请求帧范围内，则清空fetcher重新来（说明发生了跳转）
                if (this.nextStep !== undefined) {
                    if (!(this.nextStep <= i && i < this.nextStep + prefetchLength)) {
                        this.clear();
                    }
                }
                // 没有clear()，从fetcher.nextStep开始往后请求；否则从timing下整开始往后请求
                const startStep = this.nextStep ?? i;
                const reqs = createRequests(startStep, this.prefetchNum, prefetchLength);
                for (const req of reqs) {
                    this.push(req);
                }
                // 先i--，抵消后面的i++，实现对i的重试
                i--;
            }
        }
        // 移除step2Data中多余的数据
        for (const k of this.step2Data.keys()) {
            if (k < start) {
                this.step2Data.delete(k);
            }
        }
        // 如果完成后队列中的可用数据不足prefetchNum个，则发出一组请求
        if (this.q.size() < this.prefetchNum) {
            const reqs = createRequests(this.nextStep!, this.prefetchNum, prefetchLength);
            for (const req of reqs) {
                this.push(req);
            }
        }
    }

    // 用于在play时获取区间[start, end)的数据（数据已经被fetch到了）
    getWhenPlay(start: number, end: number) {
        start = Math.floor(start);
        end = Math.ceil(end);
        const res: IData[][] = [];
        for (let i = start; i < end; i++) {
            res.push(this.step2Data.get(i)!);
        }
        return res;
    }

    private clear() {
        this.q.clear();
        this.nextStep = undefined;
    }
}