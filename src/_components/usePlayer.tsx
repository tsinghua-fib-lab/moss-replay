import { useEffect, useRef, useState } from "react";
import { Layer } from "@deck.gl/core/typed";
import { RoadStatusPlayer, RoadStatusResponse } from "./players/RoadStatus";
import { LngLatBound, MessageHandler, SimRaw } from "./type";
import { message } from "antd";
import { TLPlayer, TLResponse } from "./players/TrafficLight";
import { PedestrianPlayer, PedestrianResponse } from "./players/Pedestrian";
import { IPlayer } from "./players/interface";
import { CarPlayer, CarResponse } from "./players/Car";

// sim: 模拟记录
// pickable: 是否可选中
// interpolation: 是否插值
const usePlayer = (
    sim: SimRaw | undefined,
    onCarFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: CarResponse }>,
    onPedestrianFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: PedestrianResponse }>,
    onTLFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: TLResponse }>,
    onRoadStatusFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<{ data: RoadStatusResponse }>,
    junctionLaneGeoJson: GeoJSON.Feature[],
    roadGeoJson: GeoJSON.Feature[],
    carModelPaths: { [model: string]: string },
    defaultCarModelPath: string,
    pickable: boolean,
    interpolation: boolean,
    message: MessageHandler,
) => {
    // 控制状态
    const [playing, setPlaying] = useState<boolean>(false);
    const [startT, setStartT] = useState<number>(0);
    const [endT, setEndT] = useState<number>(0);
    const t = useRef<number>(0);
    const setT = (newT: number) => {
        t.current = newT;
    }
    const speed = useRef<number>(1);
    const setSpeed = (newSpeed: number) => {
        speed.current = newSpeed;
    }
    const lastT = useRef<number>(0);
    const openLayers = useRef<Set<string>>(new Set(["micro"]));
    const switchLayer = (key: string) => {
        if (openLayers.current.has(key)) {
            openLayers.current.delete(key);
        } else {
            openLayers.current.add(key);
        }
    }

    // 动画帧句柄
    const aniHandler = useRef<number | undefined>(undefined);
    // Player对象
    const bound = useRef<LngLatBound>();
    const setBound = (newBound: LngLatBound) => {
        bound.current = newBound;
    }
    const roadStatusPlayer = useRef<RoadStatusPlayer>();
    const tlPlayer = useRef<TLPlayer>();
    const pedestrianPlayer = useRef<PedestrianPlayer>();
    const carPlayer = useRef<CarPlayer>();

    // 动画内容
    const [layers, setLayers] = useState<Layer[]>([]);

    // 当name变更时，重置并获取startT和endT
    useEffect(() => {
        setPlaying(false);
        setStartT(0);
        setEndT(0);
        t.current = 0;

        // 请求该simName的metadata
        const fetchSim = async () => {
            if (sim === undefined) {
                return;
            }
            setStartT(sim.start);
            setEndT(sim.start + sim.steps);
            t.current = sim.start;
            // 初始化图层
            roadStatusPlayer.current = new RoadStatusPlayer(onRoadStatusFetch, roadGeoJson);
            tlPlayer.current = new TLPlayer(onTLFetch, junctionLaneGeoJson);
            pedestrianPlayer.current = new PedestrianPlayer(onPedestrianFetch);
            carPlayer.current = new CarPlayer(onCarFetch, carModelPaths, defaultCarModelPath);
            await Promise.all([
                roadStatusPlayer.current.init(),
                tlPlayer.current.init(),
                pedestrianPlayer.current.init(),
                carPlayer.current.init(),
            ]);
            setLayers([]);
            message.success(`${sim.name} loaded`, 1);
        };
        fetchSim();

    }, [sim]);

    // 播放函数，每次播放一帧，改变layers
    const play = async () => {
        // 时间计算
        const nowMs = performance.now();
        const dt = (nowMs - lastT.current) * speed.current / 1000;
        lastT.current = nowMs;
        t.current = t.current + dt;
        if (t.current < startT) {
            t.current = startT;
        }
        const allPlayers: { [id: string]: IPlayer[] } = {
            macro: [roadStatusPlayer.current].filter(p => p !== undefined),
            micro: [tlPlayer.current, pedestrianPlayer.current, carPlayer.current].filter(p => p !== undefined),
        };
        const players: IPlayer[] = [];
        for (const key of openLayers.current) {
            const player = allPlayers[key];
            players.push(...player.filter(p => p !== undefined));
        }
        // 播放计算
        const playT = interpolation ? t.current : Math.floor(t.current);
        await Promise.all(players.map(async player => {
            await player.ready(playT, bound.current);
        }));
        const layers = players
            .map(player => player.play(playT, pickable))
            .flat();
        setLayers(layers);

        // 播放结束
        if (t.current >= endT) {
            setPlaying(false);
            if (aniHandler.current) {
                cancelAnimationFrame(aniHandler.current);
            }
            aniHandler.current = undefined;
            return;
        }

        aniHandler.current = requestAnimationFrame(play);
    };

    // 当playing变更时，开始或停止播放
    useEffect(() => {
        if (playing) {
            lastT.current = performance.now();
            play();
        } else {
            if (aniHandler.current) {
                cancelAnimationFrame(aniHandler.current);
            }
            aniHandler.current = undefined;
        }
        return () => {
            if (aniHandler.current) {
                cancelAnimationFrame(aniHandler.current);
            }
            aniHandler.current = undefined;
        }
    }, [playing]);

    return {
        layers,
        playing,
        setPlaying,
        startT,
        setStartT,
        endT,
        setEndT,
        speed,
        setSpeed,
        t: t.current,
        setT,
        setBound,
        openLayers: openLayers.current,
        switchLayer,
    }
}

export default usePlayer;