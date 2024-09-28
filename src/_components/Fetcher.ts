// 轮询框架
// 实现目标：维护一个请求-响应队列（Promise），队列的元素按照可视化时间排列，后面的请求的起始t一定是前一个请求的结束t，上层应用可以从队列中取出响应，进行后续的渲染处理。

export interface Frame {
    t: number;
    data: any[];
}

export interface FrameGroup {
    startT: number;
    endT: number;
    promise: Promise<Frame[]>; // HTTP请求，返回的数据按t排序
}

export class Fetcher {
    dtHint: number; // 数据帧的时间间隔
    prefetchNum: number; // 预取的未来数据数量
    prefetchLength: number; // 预取的未来数据t长度

    frameBuffer: Frame[] = []; // 按时间顺序存储最近几帧的连续数据（含预取数据），时间小于等于当前时间的数据将被自动清除

    constructor(dtHint: number, prefetchNum: number, prefetchLength: number) {
        this.dtHint = dtHint;
        this.prefetchNum = prefetchNum;
        this.prefetchLength = prefetchLength;
    }

    // 预读区间[start, end]的数据
    async fetch(startT: number, endT: number, createRequests: (t: number, prefetchNum: number, prefetchLength: number) => FrameGroup[]) {
        endT = Math.max(endT, startT + this.prefetchLength);
        // 1. 检查frameBuffer
        let log = `Fetcher: function call fetch(${startT}, ${endT})\n`;
        if (this.frameBuffer.length > 0) {
            const first = this.frameBuffer[0];
            // 1. 如果fetch的时间范围早于frameBuffer的时间范围，则清空frameBuffer
            // 即用户操作回退，需要重新fetch
            if (startT < first.t - this.dtHint) {
                this.frameBuffer = [];
            }
            // 2. 清空frameBuffer中所有早于startT - dtHint的数据
            while (this.frameBuffer.length > 0 && this.frameBuffer[0].t <= startT - this.dtHint) {
                this.frameBuffer.shift();
            }
            log += `Fetcher: buffer time range ${this.frameBuffer[0].t} - ${this.frameBuffer[this.frameBuffer.length - 1].t}\n`;
            // 3. 如果frameBuffer中已经包含了[start, end]的所有数据，则不需要再发请求
            if (this.frameBuffer.length > 0 && this.frameBuffer[this.frameBuffer.length - 1].t + this.dtHint > endT) {
                return;
            }
            // 4. 否则请求获取剩下的数据
            if (this.frameBuffer.length > 0) {
                startT = this.frameBuffer[this.frameBuffer.length - 1].t;
            }
        }
        // 2. 发送请求
        const prefetchNum = Math.ceil((endT - startT) / this.prefetchLength);
        log += `Sending requests: ${startT} - ${endT}, prefetchNum=${prefetchNum}\n`;
        const reqs = createRequests(startT, prefetchNum, this.prefetchLength);
        for (const req of reqs) {
            // 等待响应
            const newFrames = await req.promise;
            // 将新数据加入frameBuffer
            for (const frame of newFrames) {
                this.frameBuffer.push(frame);
            }
            log += `Received ${newFrames.length} frames\n`;
        }
        // 按照时间顺序排序
        this.frameBuffer.sort((a, b) => a.t - b.t);
        log += `After: buffer time range ${this.frameBuffer[0].t} - ${this.frameBuffer[this.frameBuffer.length - 1].t}\n`;
        console.log(log);
    }

    // 用于在play时获取t时刻的相关数据（当前帧或前后两帧，没找到则返回空数组）
    getWhenPlay(t: number) {
        if (this.frameBuffer.length === 0) {
            return [];
        }
        if (t < this.frameBuffer[0].t) {
            return [];
        }
        if (t > this.frameBuffer[this.frameBuffer.length - 1].t) {
            return [];
        }
        let i = 0; // 标识frameBuffer中第一个t大于等于t的元素
        for (; i < this.frameBuffer.length; i++) {
            const frame = this.frameBuffer[i];
            if (frame.t >= t) {
                break;
            }
        }
        const res: Frame[] = [];
        if (this.frameBuffer[i].t === t) {
            res.push(this.frameBuffer[i]);
        } else {
            res.push(this.frameBuffer[i - 1]);
            res.push(this.frameBuffer[i]);
        }
        return res;
    }
}