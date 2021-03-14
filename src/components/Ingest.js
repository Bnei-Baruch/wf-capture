import React, { Component } from 'react';
import {Segment, Button, Table, Message, Header, Dropdown, Divider} from 'semantic-ui-react';
import './Ingest.css';
import {getConfig, getData, newCaptureState, streamVisualizer, toHms} from "../shared/tools";
import moment from "moment";
import mqtt from "../shared/mqtt";
import media from "../shared/media";

class Ingest extends Component {

    state = {
        config: getConfig(this.props.capture),
        jsonst: {},
        start_loading: false,
        next_loading: false,
        stop_loading: false,
        main_timer: "00:00:00",
        backup_timer: "00:00:00",
        main_online: false,
        backup_online: false,
        options: [],
        preset_value: "",
    };

    componentDidMount() {
        //this.getPresets();
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
        mqtt.mq.on('state', data => {
            console.log("[capture] Got state: ", data);
            this.setState({jsonst: data});
            // Auto set previous preset
            if(data.action === "line") {
                this.getPresets();
            }
        });
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
    };

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
        this.makeDelay("start");
        let {jsonst} = this.state;
        jsonst = newCaptureState(jsonst);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        mqtt.send("start", false, "exec/service/maincap");
        mqtt.send("start", false, "exec/service/backupcap");
    };

    stopCapture = () => {
        this.makeDelay("stop");
        this.setState({preset_value: ""})
        mqtt.send("stop", false, "exec/service/maincap");
        mqtt.send("stop", false, "exec/service/backupcap");
        const {jsonst} = this.state;
        if(jsonst.line.collection_type !== "CONGRESS")
            jsonst.num_prt[jsonst.line.content_type]++;
        jsonst.action = "stop";
        jsonst.isRec = false;
        jsonst.next_part = false;
        jsonst.num_prt.part = 0;
        jsonst.line = null;
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
    };

    getPresets = () => {
        // IT's can be on dropdown click
        const {jsonst} = this.state;
        getData(data => {
            console.log("[capture] Get presets: ", data);
            let names = data;
            let options = [];
            for(let i in names.presets) {
                // Here we iterate dynamic presets
                if(i === moment().format('YYYY-MM-DD')) {
                    options.push({text: i, value: i, disabled: true})
                    let preset = names.presets[i];
                    for(let i in preset) {
                        let curpreset = preset[i];
                        let name = curpreset.name;
                        let id = curpreset.id;
                        if(!names.lines[id]) {
                            continue
                        }
                        //let curcontype = names.lines[id].content_type;
                        //let curcoltype = names.lines[id].collection_type;
                        // If we want to switch num_prt in dynamic preset
                        // we need logic based on collection_type
                        //let num = num_prt[curcontype];
                        //let prt = num_prt.part;
                        let psdate = moment.unix(jsonst.capture_id.substr(1).slice(0,-3)).format('YYYY-MM-DD');
                        name = name.replace("yyyy-mm-dd", psdate);
                        //let name = name.replace("NUM", "n"+num);
                        //let name = name.replace("PRT", "p"+prt);
                        options.push({text: name, value: id})
                    }
                }
                // Here we iterate constant presets
                if(i === "recent") {
                    options.push({text: i, value: i, disabled: true})
                    let preset = names.presets[i];
                    for(let i in preset) {
                        let curpreset = preset[i];
                        let name = curpreset.name;
                        let id = curpreset.id;
                        let curcontype = names.lines[id].content_type;
                        //let curcoltype = names.lines[id].collection_type;
                        let num = jsonst.num_prt[curcontype];
                        let prt = jsonst.num_prt.part;
                        let psdate = moment.unix(jsonst.capture_id.substr(1).slice(0,-3)).format('YYYY-MM-DD');
                        name = name.replace("DATE", psdate);
                        name = name.replace("NUM", "n"+num);
                        name = name.replace("PRT", "p"+prt);
                        options.push({text: name, value: id})
                    }
                }
            }
            this.setState({names, options});
            if(jsonst.action === "line") {
                this.setPreset(jsonst.line_id, options)
            }
        });
    };

    setPreset = (preset, options) => {
        console.log("[capture] Set preset: ", preset, options)
        const {names, jsonst} = this.state;
        const new_name = options.find(i => i.value === preset).text
        this.setState({preset_value: preset});
        let collection_type = names.lines[preset].collection_type;
        let content_type = names.lines[preset].content_type;
        let prt = jsonst.num_prt.part;
        let num = jsonst.num_prt[content_type];
        jsonst.stop_name = new_name;
        jsonst.line_id = preset;
        let line = names.lines[preset];
        line.content_type = content_type;
        line.part = (collection_type === "CONGRESS") ? line.part : prt;
        line.number = (collection_type === "CONGRESS") ? line.number : num;
        line.holiday = jsonst.isHag;
        line.capture_date = jsonst.date;
        line.final_name = new_name;
        if(content_type === "LESSON_PART") {
            line.lid = jsonst.backup_id;
        }
        if(jsonst.ishag) {
            line.hag = jsonst.holidayname;
            line.week_date = jsonst.weekdate;
            line.chol_date = jsonst.choldate;
        }
        jsonst.line = line;
        console.log("-- Store line in state: ",jsonst.line);
        // setState();
        // wfdbPost(curline);
        //FIXME: line should be in WF Database as it was in last version
        if(jsonst.action.match(/^(start|stop)$/)) {
            jsonst.action = "line";
            mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        }
        if(jsonst.action === "line") {
            console.log("-- Store line in WFDB -- ");
            const {main_src, backup_src} = this.state.config;
            const mqtt_msg = {action: "line"};
            mqtt.send(JSON.stringify(mqtt_msg), false, "workflow/service/" + main_src + "/line");
            mqtt.send(JSON.stringify(mqtt_msg), false, "workflow/service/" + backup_src + "/line");
        }
    };

    render() {
        const {config,main_online,backup_online,main_timer,backup_timer,start_loading,next_loading,stop_loading,options,preset_value} = this.state;
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
                    error={!preset_value}
                    scrolling={false}
                    placeholder={backup_online ? "--- SET PRESET ---" : "--- PRESS START ---"}
                    selection
                    value={preset_value}
                    disabled={!backup_online}
                    options={options}
                    onChange={(e,{value, options}) => this.setPreset(value, options)}
                    //onChange={(e,data) => this.setPreset(e,data)}
                    onClick={this.getPresets}
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
