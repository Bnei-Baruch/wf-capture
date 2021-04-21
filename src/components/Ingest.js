import React, { Component } from 'react';
import {Segment, Button, Table, Message, Header, Dropdown, Divider} from 'semantic-ui-react';
import './Ingest.css';
import {getConfig, getData, newCaptureState, PRESET, streamVisualizer, toHms, toSeconds} from "../shared/tools";
import moment from "moment";
import mqtt from "../shared/mqtt";
import media from "../shared/media";

class Ingest extends Component {

    state = {
        config: getConfig(this.props.capture),
        names: PRESET,
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
        recover: true,
    };

    componentDidMount() {
        this.getPresets();
        this.initMedia();
        this.initMQTT();
    };

    componentWillUnmount() {
        clearInterval(this.state.ival);
    };

    getPresets = () => {
        getData(data => {
            console.log("[capture] Get presets: ", data);
            let names = data;
            this.setState({names});
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

    initMQTT = () => {
        mqtt.init(this.state.config.user, (data) => {
            console.log("[mqtt] init: ", data);
            const watch = 'exec/service/data/#';
            const local = window.location.hostname !== "shidur.kli.one";
            const topic = local ? watch : 'bb/' + watch;
            mqtt.join(topic);
            mqtt.join('workflow/service/data/#');
            mqtt.join('workflow/state/capture/'+this.props.capture);
            this.runTimer();
            mqtt.watch((message, topic) => {
                this.onMqttMessage(message, topic);
            }, false)
            this.onMqttState();
        })
    };

    onMqttMessage = (message, topic) => {
        const src = topic.split("/")[3]
        const {main_src,backup_src} = this.state.config;
        let services = message.data;
        if(services) {
            for(let i=0; i<services.length; i++) {
                if(main_src === src) {
                    let main_online = services[i].alive;
                    let main_timer = main_online ? toHms(services[i].runtime) : "00:00:00";
                    this.setState({main_timer, main_online});
                }
                if(backup_src === src) {
                    let backup_online = services[i].alive;
                    let backup_timer = backup_online ? toHms(services[i].runtime) : "00:00:00";
                    this.setState({backup_timer, backup_online});
                }
            }
        }
    };

    onMqttState = () => {
        mqtt.mq.on('state', data => {
            console.log("[capture] Got state: ", data);
            this.setState({jsonst: data});
            this.setOptions(data, this.state.names);
            // Auto set previous preset
            if(data.isRec && data.line && this.state.recover) {
                this.setPreset(data.line_id);
                this.setState({recover: false});
            }
        });
    };

    getStat = () => {
        const {main_src, backup_src} = this.state.config;
        mqtt.send("status", false, "exec/service/"+main_src);
        mqtt.send("status", false, "exec/service/"+backup_src);
    };

    startCapture = () => {
        console.log("-- :: START CAPTURE :: --");
        const {main_src, backup_src} = this.state.config;
        this.makeDelay("start");
        let {jsonst} = this.state;
        jsonst = newCaptureState(jsonst);
        jsonst.action = "start";
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/archive");
        mqtt.send("start", false, "exec/service/archcap/sdi");
        setTimeout(() => {
            mqtt.send("start", false, "exec/service/"+main_src+"/sdi");
            mqtt.send("start", false, "exec/service/"+backup_src+"/sdi");
            //mqtt.send("start", false, "exec/service/archcap/sdi");
            console.log("-- Set start in WF -- ");
            this.setWorkflow("start");
        }, 1500);
    };

    stopCapture = () => {
        const {jsonst} = this.state;
        if (jsonst.line.content_type === "LESSON_PART" && window.confirm("WARNING!!! You going to STOP FULL LESSON Capture! Are you sure?") !== true) {
            console.log("It's was mistake");
            return;
        }
        console.log("-- :: STOP CAPTURE :: --");
        const {main_src, backup_src} = this.state.config;
        this.makeDelay("stop");
        this.setState({preset_value: ""})
        mqtt.send("stop", false, "exec/service/"+main_src+"/sdi");
        mqtt.send("stop", false, "exec/service/"+backup_src+"/sdi");
        mqtt.send("stop", false, "exec/service/archcap/sdi");
        if(jsonst.line.collection_type !== "CONGRESS")
            jsonst.num_prt[jsonst.line.content_type]++;
        jsonst.action = "stop";
        jsonst.isRec = false;
        jsonst.next_part = false;
        jsonst.num_prt.part = 0;
        jsonst.line = null;
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/archive");
        setTimeout(() => {
            console.log("-- Set stop in WF -- ");
            this.setWorkflow("stop");
        }, 1000);
    };

    startPart = () => {
        console.log("-- :: START PART :: --");
        const {jsonst} = this.state;
        const {main_src} = this.state.config;
        jsonst.capture_id = "c"+moment().format('x');
        jsonst.start_name = moment().format('YYYY-MM-DD_HH-mm-ss');
        jsonst.action = "start";
        jsonst.isRec = true;
        mqtt.send(JSON.stringify({action: "start", id: jsonst.capture_id}), false, "workflow/service/capture/" + main_src);
        mqtt.send(JSON.stringify({action: "start", id: jsonst.capture_id}), false, "workflow/service/capture/archcap");
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/archive");
        mqtt.send("start", false, "exec/service/archcap/sdi");
        setTimeout(() => {
            mqtt.send("start", false, "exec/service/"+main_src+"/sdi");
            //mqtt.send("start", false, "exec/service/archcap/sdi");
            this.setPreset(jsonst.line_id);
        }, 1500);
    };

    stopPart = () => {
        const {main_timer} = this.state;
        if (toSeconds(main_timer) < 60 && window.confirm("WARNING!!! You going to stop part less then 1 minutes?") !== true) {
            console.log("It's was mistake");
            return;
        }
        console.log("-- :: STOP PART :: --");
        const {jsonst} = this.state;
        const {main_src} = this.state.config;
        const {capture_id} = jsonst;
        this.makeDelay("next");
        jsonst.action = "stop";
        jsonst.isRec = false;
        jsonst.next_part = true;
        jsonst.num_prt.part++;
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/archive");
        mqtt.send("stop", false, "exec/service/"+main_src+"/sdi");
        mqtt.send("stop", false, "exec/service/archcap/sdi");
        mqtt.send(JSON.stringify({action: "stop", id: capture_id}), false, "workflow/service/capture/" + main_src);
        mqtt.send(JSON.stringify({action: "stop", id: capture_id}), false, "workflow/service/capture/archcap");
        setTimeout(() => {
            this.nextPart();
        }, 3000);
    };

    nextPart = () => {
        setTimeout(() => {
            this.state.main_online ? this.nextPart() : this.startPart();
        }, 3000);
    };

    setOptions = (jsonst, names) => {
        let options = [];
        for(let d in names.presets) {
            // Here we iterate dynamic presets
            if(d === moment().format('YYYY-MM-DD')) {
                options.push({text: '', value: d, disabled: true, label: d})
                let preset = names.presets[d];
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
                    //let psdate = moment.unix(jsonst.capture_id.substr(1).slice(0,-3)).format('YYYY-MM-DD');
                    name = name.replace("yyyy-mm-dd", d);
                    //let name = name.replace("NUM", "n"+num);
                    //let name = name.replace("PRT", "p"+prt);
                    options.push({text: name, value: id})
                }
            }
            // Here we iterate constant presets
            if(d === "recent") {
                options.push({text: '', value: d, disabled: true, label: d})
                let preset = names.presets[d];
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
        this.setState({options});
    };

    setPreset = (preset) => {
        console.log("[capture] Set preset: ", preset);
        const {names, jsonst, options} = this.state;
        const new_name = options.find(i => i.value === preset).text;
        console.log("[capture] Set new name: ", new_name)
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
        jsonst.action = "line";
        console.log("-- Store line in state: ",jsonst.line);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture);
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/archive");
        console.log("-- Set line in WFDB -- ");
        this.setWorkflow("line");
    };

    setWorkflow = (action) => {
        const {main_src, backup_src} = this.state.config;
        const {capture_id, backup_id} = this.state.jsonst;
        mqtt.send(JSON.stringify({action, id: capture_id}), false, "workflow/service/capture/" + main_src);
        mqtt.send(JSON.stringify({action, id: backup_id}), false, "workflow/service/capture/" + backup_src);
        mqtt.send(JSON.stringify({action, id: capture_id}), false, "workflow/service/capture/archcap");
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
        }, 7000);
    };

    render() {
        const {jsonst,config,main_online,backup_online,main_timer,backup_timer,start_loading,next_loading,stop_loading,options,preset_value} = this.state;
        if(!config) return

        const next_button = jsonst.line?.content_type === "LESSON_PART" && jsonst.line?.collection_type !== "CONGRESS"

        return (
            <Segment textAlign='center' className='stream_segment' compact raised secondary>
                <Segment clearing color='blue'>
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

                <Segment clearing color='blue'>
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
                                    disabled={!next_button || next_loading}
                                    loading={next_loading}
                                    primary
                                    onClick={this.stopPart} >
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
                                    disabled={preset_value === "" || !backup_online || stop_loading}
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
                    className="preset"
                    error={!preset_value}
                    scrolling={false}
                    placeholder={backup_online ? "--- SET PRESET ---" : "--- PRESS START ---"}
                    selection
                    value={preset_value}
                    disabled={jsonst?.next_part || !backup_online}
                    options={options}
                    onChange={(e,{value}) => this.setPreset(value)}
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
