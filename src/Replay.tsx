import ReactDOMServer from 'react-dom/server'
import { DownCircleOutlined, PauseOutlined, PlayCircleOutlined, StepBackwardOutlined, StepForwardOutlined, createFromIconfontCN } from "@ant-design/icons"
import DeckGL from '@deck.gl/react/typed'
import { FlyToInterpolator, WebMercatorViewport, Layer } from '@deck.gl/core/typed'
import { _MapContext as MapContext, NavigationControl, StaticMap } from 'react-map-gl'
import React, { useEffect, useState } from "react"
import { Button, Form, Row, Col, Input, Slider, Space, Tooltip, Checkbox, InputNumber, Flex, message } from "antd"
import usePlayer from "./_components/usePlayer"
import moment from "moment"
import { CarFrame } from './_components/players/Car'
import { PedestrianFrame } from './_components/players/Pedestrian'
import { RoadStatusFrame } from './_components/players/RoadStatus'
import { TLFrame } from './_components/players/TrafficLight'
import { LngLat, LngLatBound, LngLatZoom, MessageHandler, Sim } from './_components/type'

const IconFont = createFromIconfontCN({
    scriptUrl: "//at.alicdn.com/t/c/font_4473864_4oani4ws6sk.js",
})

const SPEED_MAP = [1, 2, 5, 10, 30, 60, 120, 300]

const InputJump = ({ layers, onJump }: {
    layers: Layer[],
    onJump: (center: LngLatZoom) => void
}) => {
    return (
        <Space>
            <Form
                layout="inline"
                onFinish={async (values: any) => {
                    onJump({
                        lng: parseFloat(values.lng),
                        lat: parseFloat(values.lat),
                        zoom: 18,
                    })
                }}
            >
                <Form.Item name="lng">
                    <Input
                        type="number"
                        placeholder="Longitude"
                    />
                </Form.Item>
                <Form.Item name="lat">
                    <Input
                        type="number"
                        placeholder="Latitude"
                    />
                </Form.Item>
                <Tooltip title="Jump to the location">
                    <Button
                        type="default"
                        htmlType="submit"
                        icon={<DownCircleOutlined />}
                    />
                </Tooltip>
            </Form>
            <Form
                layout="inline"
                onFinish={async (values: any) => {
                    console.log(layers)
                    const pid = parseInt(values.personID)
                    for (const layer of layers) {
                        // filter the layer: car-xxx, pedestrian
                        if (layer.id.startsWith('car') || layer.id.startsWith('pedestrian')) {
                            const data = layer.props.data as any[]
                            for (const d of data) {
                                if (d.id === pid) {
                                    onJump({
                                        lng: d.position[0],
                                        lat: d.position[1],
                                        zoom: 18,
                                    })
                                    return
                                }
                            }
                        }
                    }
                    message.warning(`Person ${pid} not found in the current visualization area`, 1)
                }}
            >
                <Form.Item name="personID">
                    <Input
                        type="number"
                        placeholder="Person ID"
                    />
                </Form.Item>
                <Tooltip title="Jump to the person">
                    <Button
                        type="default"
                        htmlType="submit"
                        icon={<DownCircleOutlined />}
                    />
                </Tooltip>
            </Form>
        </Space>
    )
}



export const Replay = (props: {
    sim: Sim | undefined, // the simulation data
    mapCenter: LngLatZoom, // the current center of the map
    onSetMapCenter: (center: LngLatZoom) => void, // set the center of the map
    onCarFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<CarFrame[]>,
    onPedestrianFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<PedestrianFrame[]>,
    onTLFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<TLFrame[]>,
    onRoadStatusFetch: (startT: number, endT: number, bound?: LngLatBound) => Promise<RoadStatusFrame[]>,
    aoiGeoJson: GeoJSON.Feature[], // the AOI GeoJSON
    allLaneGeoJson: GeoJSON.Feature[], // all road lane GeoJSON
    junctionLaneGeoJson: GeoJSON.Feature[], // junction road lane GeoJSON
    roadGeoJson: GeoJSON.Feature[], // road GeoJSON
    carModelPaths: { [model: string]: string },
    defaultCarModelPath: string,
    mapboxAccessToken: string, // the mapbox token
    message: MessageHandler,
    deckHeight?: string | number, // deck高度
    extraHeader?: React.ReactNode, // 额外的头部
    fps?: number, // 帧率（不一定准确）
}) => {
    // internal state
    const [hovering, setHovering] = useState(false)
    const [mouse, setMouse] = useState<LngLat>({ lng: 0, lat: 0 })

    // user input by GUI
    const [sliderValue, setSliderValue] = useState<number | undefined>()

    const {
        layers,
        startT, endT,
        t, setT,
        playing, setPlaying,
        setSpeed,
        setBound,
        openMicroLayer, setOpenMicroLayer,
        openMacroLayer, setOpenMacroLayer,
        openAoiLayer, setOpenAoiLayer,
        openAllLaneLayer, setOpenAllLaneLayer,
        interpolation, setInterpolation,
        pickable, setPickable,
    } = usePlayer(
        props.sim,
        props.onCarFetch,
        props.onPedestrianFetch,
        props.onTLFetch,
        props.onRoadStatusFetch,
        props.junctionLaneGeoJson,
        props.roadGeoJson,
        props.aoiGeoJson,
        props.allLaneGeoJson,
        props.carModelPaths,
        props.defaultCarModelPath,
        props.fps ?? 30,
    )

    // console.log geojsons change
    useEffect(() => {
        // console.log(`aoiGeoJson changed to ${props.aoiGeoJson.length} features`)
    }, [props.aoiGeoJson])
    useEffect(() => {
        // console.log(`allLaneGeoJson changed to ${props.allLaneGeoJson.length} features`)
    }, [props.allLaneGeoJson])

    const layerButtons = (
        <Space direction="horizontal" size="small">
            <Checkbox
                checked={interpolation}
                onChange={(e: any) => {
                    setInterpolation(e.target.checked)
                }}
            >
                Interpolate
            </Checkbox>
            <Checkbox
                checked={pickable}
                onChange={(e: any) => setPickable(e.target.checked)}
            >
                Pick
            </Checkbox>
            <Tooltip placement="bottom" title="Vehicle | Pedestrian | Traffic Light">
                <Button
                    type={openMicroLayer ? "link" : "text"}
                    icon={<IconFont type='icon-car-fill' />}
                    onClick={() => setOpenMicroLayer(!openMicroLayer)}
                />
            </Tooltip>
            <Tooltip placement="bottom" title="Road Status">
                <Button
                    type={openMacroLayer ? "link" : "text"}
                    icon={<IconFont type='icon-gaosu' />}
                    onClick={() => setOpenMacroLayer(!openMacroLayer)}
                />
            </Tooltip>
            <Tooltip placement="bottom" title="AOI">
                <Button
                    type={openAoiLayer ? "link" : "text"}
                    icon={<IconFont type='icon-community-line' />}
                    onClick={() => setOpenAoiLayer(!openAoiLayer)}
                />
            </Tooltip>
            <Tooltip placement="bottom" title="More Lane Information">
                <Button
                    type={openAllLaneLayer ? "link" : "text"}
                    icon={<IconFont type='icon-daolu' />}
                    onClick={() => {
                        const next = !openAllLaneLayer;
                        if (next) {
                            props.message.warning("Enabling this option may affect display performance, please note!", 1)
                        }
                        setOpenAllLaneLayer(next);
                    }}
                />
            </Tooltip>
        </Space>
    )

    return (
        <Row style={{ textAlign: 'center' }}>
            <Col span={24}>
                <Row style={{
                    marginTop: "8px",
                }} justify='center' align='middle'>
                    <Flex gap="middle" justify="center" align="center">
                        <InputJump layers={layers} onJump={props.onSetMapCenter} />
                        {layerButtons}
                        {props.extraHeader}
                    </Flex>
                </Row>
                <Row>
                    <Col span={24}>
                        <div style={{
                            marginTop: "16px",
                            height: props.deckHeight ?? "80vh",
                            borderRadius: "16px 16px 0px 0px",
                            boxShadow: "0px 4px 10px 0px rgba(80, 80, 80, 0.1)",
                            position: 'relative',
                        }}>
                            <div style={{
                                position: 'fixed',
                                top: '8%',   // 根据需求调整距离底部的空间
                                right: '5%',    // 根据需求调整距离右侧的空间
                                width: 'auto',
                                height: 'auto',
                                zIndex: 1000,
                                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                borderRadius: '8px',
                                alignItems: 'center',
                            }}>
                                <span style={{ padding: "8px", color: "#007AFF", fontSize: 16 }}>{mouse.lng.toFixed(8)}{', '}{mouse.lat.toFixed(8)}</span>
                            </div>
                            <DeckGL
                                initialViewState={{
                                    longitude: props.mapCenter.lng,
                                    latitude: props.mapCenter.lat,
                                    zoom: props.mapCenter.zoom,
                                    pitch: 0,
                                    bearing: 0,
                                    transitionDuration: 2000,
                                    transitionInterpolator: new FlyToInterpolator(),
                                }}
                                controller={true}
                                layers={layers}
                                onHover={(info: any) => {
                                    const { object, coordinate } = info
                                    setHovering(Boolean(object))
                                    if (coordinate) {
                                        setMouse({ lng: coordinate[0], lat: coordinate[1] })
                                    } else {
                                        setMouse({ lng: 0, lat: 0 })
                                    }
                                }}
                                getCursor={() => hovering ? 'pointer' : 'grab'}
                                getTooltip={({ object, layer }: any) => {
                                    if (!object) {
                                        return null
                                    }
                                    if (layer.id.startsWith('car')) {
                                        // multi line html to show id, position, angle, v
                                        const body = (
                                            <div>
                                                <p>
                                                    Car {object.id}
                                                    <br />
                                                    Position: {object.position.join(', ')}
                                                    <br />
                                                    Angle: {object.angle.toFixed(2)} rad
                                                    <br />
                                                    Speed: {(object.v * 3.6).toFixed(2)} km/h
                                                    <br />
                                                    Passengers: {object.numPassengers}
                                                </p>
                                            </div>
                                        )
                                        return {
                                            html: ReactDOMServer.renderToString(body),
                                            style: {
                                                backgroundColor: 'rgba(255, 255, 255)',
                                            }
                                        }
                                    }
                                    if (layer.id.startsWith('pedestrian')) {
                                        const body = (
                                            <div>
                                                <p>
                                                    Pedestrian {object.id}
                                                    <br />
                                                    Position: {object.position.join(', ')}
                                                    <br />
                                                    Angle: {object.angle.toFixed(2)} rad
                                                    <br />
                                                    Speed: {(object.v * 3.6).toFixed(2)} km/h
                                                </p>
                                            </div>
                                        )
                                        return {
                                            html: ReactDOMServer.renderToString(body),
                                            style: {
                                                backgroundColor: 'rgba(255, 255, 255)',
                                            }
                                        }
                                    }
                                    if (object.properties !== undefined) {
                                        return {
                                            html: `<pre>${JSON.stringify(object.properties, null, '  ')}</pre>`,
                                            style: {
                                                backgroundColor: 'rgba(255, 255, 255)',
                                                color: 'black',
                                                // 左对齐
                                                textAlign: 'left',
                                            }
                                        }
                                    }
                                    return {
                                        html: `<pre>${JSON.stringify(object, null, '  ')}</pre>`,
                                        style: {
                                            backgroundColor: 'rgba(255, 255, 255)',
                                            color: 'black',
                                            // 左对齐
                                            textAlign: 'left',
                                        }
                                    }
                                }}
                                onViewStateChange={({ viewState }: any) => {
                                    const viewport = new WebMercatorViewport(viewState)
                                    const [lng1, lat2] = viewport.unproject([0, 0])
                                    const [lng2, lat1] = viewport.unproject([viewport.width, viewport.height])
                                    setBound({ lng1, lat1, lng2, lat2 })
                                }}
                                ContextProvider={MapContext.Provider as any}
                            >
                                <StaticMap mapboxApiAccessToken={props.mapboxAccessToken} />
                                <NavigationControl style={{
                                    position: 'absolute',
                                    top: 10,
                                    left: 10
                                }} />
                            </DeckGL>
                        </div>
                    </Col>
                </Row>
                <Row style={{ padding: "8px 0px 0px 0px" }}>
                    <Col span={24}>
                        <Flex gap="middle" justify="center" align="center">
                            <Space size="small">
                                {playing ? (
                                    <Button
                                        icon={<PauseOutlined />}
                                        onClick={() => setPlaying(false)}
                                    />
                                ) : (
                                    <Button
                                        icon={<PlayCircleOutlined />}
                                        onClick={() => setPlaying(true)}
                                    />
                                )}
                                <Button
                                    icon={<StepBackwardOutlined />}
                                    onClick={async () => await setT(t - 1)}
                                />
                                <Button
                                    icon={<StepForwardOutlined />}
                                    onClick={async () => await setT(t + 1)}
                                />
                            </Space>
                            <Space size="small">
                                <span>Speedup: </span>
                                <Slider
                                    min={0}
                                    max={SPEED_MAP.length - 1}
                                    tooltip={{ formatter: (value?: number) => `${SPEED_MAP[value ?? 0]}` }}
                                    onChange={(value: any) => {
                                        setSpeed(SPEED_MAP[value ?? 0])
                                    }}
                                    defaultValue={0}
                                    style={{ width: 60 }}
                                />
                            </Space>
                            <Space size="small">
                                <span>Skip to: </span>
                                <Form
                                    layout="inline"
                                    onFinish={async (values: any) => {
                                        const t = Number(values.goTime)
                                        await setT(t)
                                    }}
                                >
                                    <Form.Item name="goTime">
                                        <InputNumber
                                            controls={false}
                                            size="small"
                                            style={{ width: 80 }}
                                            placeholder="Frame"
                                        />
                                    </Form.Item>
                                    <Button htmlType="submit">Goto</Button>
                                </Form>
                            </Space>
                            <Space size="small">
                                <div>
                                    Play:
                                    {moment("00:00:00", "HH:mm:ss")
                                        .add(startT, "seconds")
                                        .format("HH:mm:ss")}
                                    /
                                    {moment("00:00:00", "HH:mm:ss")
                                        .add(t, "seconds")
                                        .format("HH:mm:ss")}
                                    /
                                    {moment("00:00:00", "HH:mm:ss")
                                        .add(endT, "seconds")
                                        .format("HH:mm:ss")}
                                </div>
                            </Space>
                        </Flex>
                    </Col>
                </Row>
                <Row justify="space-around" align="middle">
                    <Col span={2}>
                        <span>Progress Bar</span>
                    </Col>
                    <Col span={20}>
                        <Slider
                            min={startT}
                            max={endT}
                            value={sliderValue ?? t}
                            onChange={setSliderValue}
                            onChangeComplete={async (value: any) => {
                                const t = Number(value)
                                await setT(t)
                                setSliderValue(undefined)
                            }}
                        />
                    </Col>
                </Row>
            </Col >
        </Row >
    )
}

