import React, { Component } from 'react';
import {Segment, Button, Table, Message, Header, Dropdown, Divider} from 'semantic-ui-react';
import './Ingest.css';
import {getConfig, getData, newCaptureState, streamVisualizer, toHms} from "../shared/tools";
import mqtt from "../shared/mqtt";
import media from "../shared/media";

class Ingest extends Component {

    state = {
        config: getConfig('single'),
        start_loading: false,
        next_loading: false,
        stop_loading: false,
        main_timer: "00:00:00",
        backup_timer: "00:00:00",
        main_online: false,
        backup_online: false,
    };

    componentDidMount() {
        console.log("[capture] New capture state: ", newCaptureState())

        // IT's can be on dropdown click
        getData(data => console.log("[capture] Get presets: ", data))
        this.initMedia();
        this.initMQTT();
    };

    componentWillUnmount() {
        clearInterval(this.state.ival);
    };

    initMQTT = () => {
        mqtt.init(this.state.config.user, (data) => {
            console.log("[mqtt] init: ", data);
            const watch = 'exec/service/data/#';
            const local = window.location.hostname !== "shidur.kli.one";
            const topic = local ? watch : 'bb/' + watch;
            mqtt.join(topic);
            mqtt.join('workflow/service/data/#');
            mqtt.join('workflow/state/capture/#');
            this.runTimer();
            mqtt.watch((message, topic) => {
                this.onMqttMessage(message, topic);
            }, false)
        })
        mqtt.mq.on('workflow', data => console.log("[capture] Got state: ", data));
    };

    initMedia = () => {
        let {jv_id, ja_id, header} = this.state.config
        document.title = header;
        media.init(() => {
            media.initVideoStream(jv_id, (stream) => {
                let video = this.refs.v1;
                video.srcObject = stream;
            });
            for(let i=1; i<5; i++) {
                media.initAudioStream(ja_id*10+i, i, (stream) => {
                    this.attachStream(stream, i)
                });
            }
        })
    }

    attachStream = (stream, i) => {
        let audio = this.refs["a" + i];
        audio.srcObject = stream;
        streamVisualizer(stream, this.refs["canvas" + i],100);
    };

    onMqttMessage = (message, topic) => {
        const src = topic.split("/")[3]
        const {main_src,backup_src} = this.state.config;
        let services = message.data;
        if(services) {
            for(let i=0; i<services.length; i++) {
                if(main_src === src) {
                    this.setState({main_timer: toHms(services[i].runtime), main_online: services[i].alive});
                }
                if(backup_src === src) {
                    this.setState({backup_timer: toHms(services[i].runtime), backup_online: services[i].alive});
                }
            }
        }
    };

    runTimer = () => {
        this.getStat();
        if(this.state.ival)
            clearInterval(this.state.ival);
        let ival = setInterval(() => {
            this.getStat();
        }, 1000);
        this.setState({ival});
    };

    makeDelay = (key) => {
        this.setState({[`${key}_loading`]: true});
        setTimeout(() => {
            this.setState({[`${key}_loading`]: false});
        }, 3000);
    };

    getStat = () => {
        mqtt.send("status", false, "exec/service/maincap");
        mqtt.send("status", false, "exec/service/backupcap");
    };

    startCapture = () => {
        this.makeDelay("start")
        mqtt.send("start", false, "exec/service/maincap");
        mqtt.send("start", false, "exec/service/backupcap");
    };

    stopCapture = () => {
        this.makeDelay("stop")
        mqtt.send("stop", false, "exec/service/maincap");
        mqtt.send("stop", false, "exec/service/backupcap");
    }


    render() {
        const {config,main_online,backup_online,main_timer,backup_timer,start_loading,next_loading,stop_loading} = this.state;
        if(!config) return

        return (


            <Segment textAlign='center' className='stream_segment' compact raised secondary>
                <Segment clearing>
                <Header as='h1'>
                    {config.header}
                </Header>
                </Segment>

                    <Table basic='very' unstackable>
                        <Table.Row>
                            <Table.Cell textAlign='right'>
                                <Message compact className='vu_box'>
                                    <canvas className='cvu' ref={"canvas1"} width="25" height="100" />
                                    <canvas className='cvu' ref={"canvas2"} width="25" height="100" />
                                    <canvas className='cvu' ref={"canvas3"} width="25" height="100" />
                                    <canvas className='cvu' ref={"canvas4"} width="25" height="100" />
                                </Message>
                            </Table.Cell>
                            <Table.Cell textAlign='center'>
                                <Message compact
                                         negative={!main_online}
                                         positive={main_online}
                                         className='main_timer' >{main_timer}</Message>
                            </Table.Cell>
                        </Table.Row>
                    </Table>

                <Segment clearing>
                <Table basic='very'  unstackable>
                    <Table.Row>
                        <Table.Cell>
                            <Button fluid size='huge'
                                    disabled={backup_online || start_loading}
                                    loading={start_loading}
                                    positive
                                    onClick={this.startCapture} >
                                Start
                            </Button>
                        </Table.Cell>
                        <Table.Cell>
                            <Button fluid size='huge'
                                    disabled
                                    loading={next_loading}
                                    primary
                                    onClick={this.nextPart} >
                                Next
                            </Button>
                        </Table.Cell>
                        <Table.Cell width={6}>
                            <Message compact
                                     negative={!backup_online}
                                     positive={backup_online}
                                     className='timer' >{backup_timer}</Message>
                        </Table.Cell>
                        <Table.Cell>
                            <Button fluid size='huge'
                                    disabled={!backup_online || stop_loading}
                                    loading={stop_loading}
                                    negative
                                    onClick={this.stopCapture} >
                                Stop
                            </Button>
                        </Table.Cell>
                    </Table.Row>
                </Table>
                </Segment>

                <Dropdown
                    fluid
                    className="trim_files_dropdown"
                    error
                    scrolling={false}
                    placeholder="--- PRESS START ---"
                    selection
                    value
                    disabled
                    options={[]}
                    onChange={(e,{value}) => this.selectFile(value)}
                    onClick={() => this.getCaptured(this.state.date)}
                >
                </Dropdown>

                <Divider />

                <video ref="v1" autoPlay controls={false} muted />
                <audio ref="a1" autoPlay controls={false} muted />
                <audio ref="a2" autoPlay controls={false} muted />
                <audio ref="a3" autoPlay controls={false} muted />
                <audio ref="a4" autoPlay controls={false} muted />

            </Segment>

        );
    }
}

export default Ingest;
