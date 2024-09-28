import { useEffect, useRef, useState } from "react";
import { Layer } from "@deck.gl/core/typed";
import { GeoJsonLayer } from '@deck.gl/layers/typed'
import { RoadStatusFrame, RoadStatusPlayer } from "./players/RoadStatus";
import { LngLatBound, Sim } from "./type";
import { TLFrame, TLPlayer } from "./players/TrafficLight";
import { PedestrianFrame, PedestrianPlayer } from "./players/Pedestrian";
import { IPlayer } from "./players/interface";
import { CarFrame, CarPlayer } from "./players/Car";

// sim: 模拟记录
// pickable: 是否可选中
// interpolation: 是否插值
const usePlayer = (
    sim: Sim | undefined,
    onCarFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<CarFrame[]>,
    onPedestrianFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<PedestrianFrame[]>,
    onTLFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<TLFrame[]>,
    onRoadStatusFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<RoadStatusFrame[]>,
    junctionLaneGeoJson: GeoJSON.Feature[],
    roadGeoJson: GeoJSON.Feature[],
    aoiGeoJson: GeoJSON.Feature[],
    allLaneGeoJson: GeoJSON.Feature[],
    carModelPaths: { [model: string]: string },
    defaultCarModelPath: string,
    openMicroLayer: boolean,
    openMacroLayer: boolean,
    openAoiLayer: boolean,
    openAllLaneLayer: boolean,
    interpolation: boolean,
    pickable: boolean,
) => {
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
            await play(sim.start);
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
        if (openAoiLayer) {
            layers.push(new GeoJsonLayer({
                id: 'aoi',
                data: aoiGeoJson,
                stroked: true,
                filled: true,
                extruded: false,
                lineWidthScale: 1,
                lineWidthMinPixels: 1,
                getLineColor: [230, 199, 168, 128],
                getFillColor: [230, 199, 168, 64],
                pickable: pickable,
            }))
        }
        if (openAllLaneLayer) {
            layers.push(new GeoJsonLayer({
                id: 'more-lane',
                data: allLaneGeoJson,
                stroked: true,
                filled: true,
                extruded: false,
                lineWidthScale: 1,
                lineWidthMinPixels: 1,
                getLineColor: (f: any) => f.properties.type === 1 ? [0, 153, 204, 64] : [0, 153, 255, 32],
                pickable: pickable,
            }))
        }
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
            if (aniHandler.current) {
                cancelAnimationFrame(aniHandler.current);
            }
            aniHandler.current = undefined;
            play();
        } else {
            play(t.current);
        }
    }, [openMicroLayer, openMacroLayer, openAoiLayer, openAllLaneLayer, interpolation, pickable]);

    const setT = async (newT: number) => {
        if (playing) {
            t.current = newT;
        } else {
            await play(newT);
        }
    }

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
    }
}

export default usePlayer;