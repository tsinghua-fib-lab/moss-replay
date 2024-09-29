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
    fps: number,
) => {
    // 控制状态
    const [_forRender, _setForRender] = useState<number>(0);
    const startT = useRef<number>(0);
    const setStartT = (newStartT: number) => {
        startT.current = newStartT;
        _setForRender(_forRender + 1);
    }
    const endT = useRef<number>(0);
    const setEndT = (newEndT: number) => {
        endT.current = newEndT;
        _setForRender(_forRender + 1);
    }
    const t = useRef<number>(0);
    const lastT = useRef<number>(0);
    const speed = useRef<number>(1);
    const setSpeed = (newSpeed: number) => {
        speed.current = newSpeed;
        _setForRender(_forRender + 1);
    }
    const playing = useRef<boolean>(false);
    const setPlaying = (newPlaying: boolean) => {
        if (newPlaying) {
            lastT.current = performance.now();
        }
        playing.current = newPlaying;
        _setForRender(_forRender + 1);
    }
    const openMicroLayer = useRef<boolean>(true);
    const openMacroLayer = useRef<boolean>(true);
    const openAoiLayer = useRef<boolean>(false);
    const openAllLaneLayer = useRef<boolean>(false);
    const interpolation = useRef<boolean>(true);
    const pickable = useRef<boolean>(false);

    const aoiGeoJsonRef = useRef<GeoJSON.Feature[]>([]);
    const allLaneGeoJsonRef = useRef<GeoJSON.Feature[]>([]);

    // Player对象
    const bound = useRef<LngLatBound>();
    const setBound = (newBound: LngLatBound) => {
        bound.current = newBound;
    }
    const roadStatusPlayer = useRef<RoadStatusPlayer>();
    const tlPlayer = useRef<TLPlayer>();
    const pedestrianPlayer = useRef<PedestrianPlayer>();
    const carPlayer = useRef<CarPlayer>();

    // 动画循环
    const loopStarted = useRef<boolean>(false);
    const fpsInterval = 1000 / fps;
    const then = useRef<number>(0);

    // 动画内容
    const [layers, setLayers] = useState<Layer[]>([]);

    useEffect(() => {
        if (!loopStarted.current) {
            loopStarted.current = true;
            then.current = performance.now();
            loop();
        }
    }, []);

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

    useEffect(() => {
        aoiGeoJsonRef.current = aoiGeoJson;
    }, [aoiGeoJson]);

    useEffect(() => {
        allLaneGeoJsonRef.current = allLaneGeoJson;
    }, [allLaneGeoJson]);

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
        if (t.current < startT.current) {
            t.current = startT.current;
        }
        if (t.current > endT.current) {
            t.current = endT.current;
        }
        let players: IPlayer[] = [];
        if (openMicroLayer.current) {
            players.push(tlPlayer.current as IPlayer);
            players.push(pedestrianPlayer.current as IPlayer);
            players.push(carPlayer.current as IPlayer);
        }
        if (openMacroLayer.current) {
            players.push(roadStatusPlayer.current as IPlayer);
        }
        players = players.filter(p => p !== undefined);
        // console.log(`player: play at ${t.current}`);
        // 播放计算
        const playT = interpolation.current ? t.current : Math.floor(t.current);
        const layers = (await Promise.all(players
            .map(player => player.play(playT, interpolation.current, pickable.current, bound.current))
        )).flat();
        if (openAoiLayer.current) {
            layers.push(new GeoJsonLayer({
                id: 'aoi',
                data: aoiGeoJsonRef.current,
                stroked: true,
                filled: true,
                extruded: false,
                lineWidthScale: 1,
                lineWidthMinPixels: 1,
                getLineColor: [230, 199, 168, 128],
                getFillColor: [230, 199, 168, 64],
                pickable: pickable.current,
            }))
        }
        if (openAllLaneLayer.current) {
            layers.push(new GeoJsonLayer({
                id: 'more-lane',
                data: allLaneGeoJsonRef.current,
                stroked: true,
                filled: true,
                extruded: false,
                lineWidthScale: 1,
                lineWidthMinPixels: 1,
                getLineColor: (f: any) => f.properties.type === 1 ? [0, 153, 204, 64] : [0, 153, 255, 32],
                pickable: pickable.current,
            }))
        }
        setLayers(layers);

        // 播放结束
        // console.log(`player: check end ${t.current} ? ${endT.current}`);
        if (t.current >= endT.current) {
            setPlaying(false);
        }
    };

    // 固定帧率调用play
    const loop = async () => {
        const now = performance.now();
        const elapsed = now - then.current;

        if (elapsed > fpsInterval) {
            then.current = now - (elapsed % fpsInterval);
            if (playing.current) {
                await play();
            }
        }
        requestAnimationFrame(() => loop());
    };

    const setOpenMicroLayer = async (newOpenMicroLayer: boolean) => {
        openMicroLayer.current = newOpenMicroLayer;
        _setForRender(_forRender + 1);
        await play(t.current);
    }
    const setOpenMacroLayer = async (newOpenMacroLayer: boolean) => {
        openMacroLayer.current = newOpenMacroLayer;
        _setForRender(_forRender + 1);
        await play(t.current);
    }
    const setOpenAoiLayer = async (newOpenAoiLayer: boolean) => {
        openAoiLayer.current = newOpenAoiLayer;
        _setForRender(_forRender + 1);
        await play(t.current);
    }
    const setOpenAllLaneLayer = async (newOpenAllLaneLayer: boolean) => {
        openAllLaneLayer.current = newOpenAllLaneLayer;
        _setForRender(_forRender + 1);
        await play(t.current);
    }
    const setInterpolation = async (newPickable: boolean) => {
        interpolation.current = newPickable;
        _setForRender(_forRender + 1);
        await play(t.current);
    }
    const setPickable = async (newPickable: boolean) => {
        pickable.current = newPickable;
        _setForRender(_forRender + 1);
        await play(t.current);
    }

    const setT = async (newT: number) => {
        lastT.current = performance.now();
        t.current = newT;
        await play(newT);
    }

    return {
        layers,
        playing: playing.current,
        setPlaying,
        startT: startT.current,
        setStartT,
        endT: endT.current,
        setEndT,
        speed,
        setSpeed,
        t: t.current,
        setT,
        setBound,
        openMicroLayer: openMicroLayer.current, setOpenMicroLayer,
        openMacroLayer: openMacroLayer.current, setOpenMacroLayer,
        openAoiLayer: openAoiLayer.current, setOpenAoiLayer,
        openAllLaneLayer: openAllLaneLayer.current, setOpenAllLaneLayer,
        interpolation: interpolation.current, setInterpolation,
        pickable: pickable.current, setPickable,
    }
}

export default usePlayer;