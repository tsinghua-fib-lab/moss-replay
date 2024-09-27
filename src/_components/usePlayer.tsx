import { useEffect, useRef, useState } from "react";
import { Layer } from "@deck.gl/core/typed";
import { RoadStatusPlayer, RoadStatusResponse } from "./players/RoadStatus";
import { LngLatBound, MessageHandler, SimRaw } from "./type";
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
    message: MessageHandler,
) => {
    // 图层状态
    const [openMicroLayer, setOpenMicroLayer] = useState(true)
    const [openMacroLayer, setOpenMacroLayer] = useState(true)
    const [interpolation, setInterpolation] = useState(true)
    const [pickable, setPickable] = useState(false)
    // 控制状态
    const [playing, setPlaying] = useState<boolean>(false);
    const [startT, setStartT] = useState<number>(0);
    const [endT, setEndT] = useState<number>(0);
    const t = useRef<number>(0);

    const speed = useRef<number>(1);
    const setSpeed = (newSpeed: number) => {
        speed.current = newSpeed;
    }
    const lastT = useRef<number>(0);

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

    useEffect(() => {
        if (roadStatusPlayer.current) {
            roadStatusPlayer.current.updateGeoJson(roadGeoJson);
        }
    }, [roadGeoJson]);

    useEffect(() => {
        if (tlPlayer.current) {
            tlPlayer.current.updateGeoJson(junctionLaneGeoJson);
        }
    }, [junctionLaneGeoJson]);

    // 播放函数，每次播放一帧，改变layers
    const play = async (forceT?: number) => {
        // 时间计算
        const nowMs = performance.now();
        if (forceT !== undefined) {
            lastT.current = nowMs;
            t.current = forceT;
        } else {
            const dt = (nowMs - lastT.current) * speed.current / 1000;
            lastT.current = nowMs;
            t.current = t.current + dt;
        }
        if (t.current < startT) {
            t.current = startT;
        }
        if (t.current > endT) {
            t.current = endT;
        }
        let players: IPlayer[] = [];
        if (openMicroLayer) {
            players.push(tlPlayer.current as IPlayer);
            players.push(pedestrianPlayer.current as IPlayer);
            players.push(carPlayer.current as IPlayer);
        }
        if (openMacroLayer) {
            players.push(roadStatusPlayer.current as IPlayer);
        }
        players = players.filter(p => p !== undefined);
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

        if (forceT === undefined) {
            // 循环播放
            aniHandler.current = requestAnimationFrame(() => {
                play();
            });
        }
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

    // 当控制开关变化时，启停播放
    useEffect(() => {
        if (playing) {
            console.log("playing with option changed")
            if (aniHandler.current) {
                cancelAnimationFrame(aniHandler.current);
            }
            aniHandler.current = undefined;
            play();
        } else {
            console.log("not playing with option changed")
            play(t.current);
        }
    }), [openMicroLayer, openMacroLayer, interpolation, pickable];

    const setT = async (newT: number) => {
        if (playing) {
            t.current = newT;
        } else {
            await play(newT);
        }
    }

    return {
        openMicroLayer, setOpenMicroLayer,
        openMacroLayer, setOpenMacroLayer,
        interpolation, setInterpolation,
        pickable, setPickable,
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
    }
}

export default usePlayer;