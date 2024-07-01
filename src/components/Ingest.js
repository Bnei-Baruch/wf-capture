import React, { Component } from 'react';
import {Segment, Button, Table, Message, Header, Dropdown, Divider} from 'semantic-ui-react';
import './Ingest.css';
import {getConfig, getIngestState, getData, newCaptureState, PRESETS, streamVisualizer, toSeconds, setIngestState} from "../shared/tools";
import moment from "moment";
import mqtt from "../shared/mqtt";
import media from "../shared/media";

class Ingest extends Component {

    state = {
        config: getConfig(this.props.capture),
        presets: PRESETS,
        jsonst: {},
        start_loading: false,
        next_loading: false,
        stop_loading: false,
        main_timer: "00:00:00",
        backup_timer: "00:00:00",
        main_online: false,
        backup_online: false,
        options: [],
        line_id: "",
        recover: true,
    };

    componentDidMount() {
        getIngestState(this.props.capture, data => {
            console.log(" :: Ingest State: ", data);
        })
        this.initMedia();
        this.initMQTT();
    };

    componentWillUnmount() {
        clearInterval(this.state.ival);
    };

    getPresets = (jsonst) => {
        getData(data => {
            let presets = data || this.state.presets;
            console.log("[capture] Get presets: ", presets);
            this.setOptions(jsonst, presets);
            this.setState({presets});
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
            mqtt.join(topic , 1);
            mqtt.join('workflow/service/data/#', 1);
            mqtt.join('workflow/state/capture/'+this.props.capture, 1);
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

        if(main_src === src) {
            let main_online = message.message === "On";
            let main_timer = main_online && services?.out_time ? services.out_time.split('.')[0] : "00:00:00";
            this.setState({main_timer, main_online});
        }
        if(backup_src === src) {
            let backup_online = message.message === "On";
            let backup_timer = backup_online && services?.out_time ? services.out_time.split('.')[0] : "00:00:00";
            this.setState({backup_timer, backup_online});
        }
    };

    onMqttState = () => {
        mqtt.mq.on('state', data => {
            console.log("[capture] Got state: ", data);
            this.getPresets(data);
            this.setState({jsonst: data});
        });
    };

    getStat = () => {
        const {main_src, backup_src} = this.state.config;
        mqtt.send("progress", false, "exec/service/"+main_src, 0);
        mqtt.send("progress", false, "exec/service/"+backup_src, 0);
    };

    startCapture = () => {
        console.log("-- :: START CAPTURE :: --");
        const {arch_src, main_src, backup_src} = this.state.config;
        this.makeDelay("start");
        let {jsonst} = this.state;
        jsonst = newCaptureState(jsonst);
        jsonst.action = "start";
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture, 1);
        setTimeout(() => {
            if(this.props.capture === "multi") {
                mqtt.send("start", false, "exec/service/"+arch_src+"/sdi", 1);
                // mqtt.send("start", false, "exec/service/livecap1/sdi", 1);
                // mqtt.send("start", false, "exec/service/livecap2/sdi", 1);
            }
            mqtt.send("start", false, "exec/service/"+main_src+"/sdi", 1);
            setTimeout(() => {
                mqtt.send("start", false, "exec/service/"+backup_src+"/sdi", 1);
            },1000)
            console.log("-- Set start in WF -- ");
            this.setWorkflow("start");
        }, 3000);
    };

    stopCapture = () => {
        const {jsonst} = this.state;
        if (jsonst.line.content_type === "LESSON_PART" && window.confirm("WARNING!!! You going to STOP FULL LESSON Capture! Are you sure?") !== true) {
            console.log("It's was mistake");
            return;
        }
        console.log("-- :: STOP CAPTURE :: --");
        const {arch_src, main_src, backup_src} = this.state.config;
        this.makeDelay("stop");
        this.setState({line_id: ""})
        if(this.props.capture === "multi") {
            mqtt.send("stop", false, "exec/service/"+arch_src+"/sdi", 1);
            // mqtt.send("stop", false, "exec/service/livecap1/sdi", 1);
            // mqtt.send("stop", false, "exec/service/livecap2/sdi", 1);
        }
        mqtt.send("stop", false, "exec/service/"+main_src+"/sdi", 1);
        mqtt.send("stop", false, "exec/service/"+backup_src+"/sdi", 1);
        if(jsonst.line.collection_type !== "CONGRESS")
            jsonst.num_prt[jsonst.line.content_type]++;
        jsonst.action = "stop";
        jsonst.isRec = false;
        jsonst.next_part = false;
        jsonst.num_prt.part = 0;
        jsonst.line = null;
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture, 1);
        setTimeout(() => {
            console.log("-- Set stop in WF -- ");
            this.setWorkflow("stop");
        }, 3000);
    };

    startPart = () => {
        console.log("-- :: START PART :: --");
        const {jsonst} = this.state;
        const {arch_src, main_src} = this.state.config;
        jsonst.capture_id = "c"+moment().format('x');
        jsonst.start_name = moment().format('YYYY-MM-DD_HH-mm-ss');
        jsonst.action = "start";
        jsonst.isRec = true;
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture, 1);
        mqtt.send(JSON.stringify({action: "start", id: jsonst.capture_id}), false, "workflow/service/capture/" + arch_src, 1);
        mqtt.send(JSON.stringify({action: "start", id: jsonst.capture_id}), false, "workflow/service/capture/" + main_src, 1);
        setTimeout(() => {
            mqtt.send("start", false, "exec/service/"+arch_src+"/sdi", 1);
            mqtt.send("start", false, "exec/service/"+main_src+"/sdi", 1);
            //FIXME: Here we to simulate choose option in ui
            this.saveLine(jsonst.line_id);
        }, 3000);
    };

    stopPart = () => {
        const {main_timer} = this.state;
        if (toSeconds(main_timer) < 60 && window.confirm("WARNING!!! You going to stop part less then 1 minutes?") !== true) {
            console.log("It's was mistake");
            return;
        }
        console.log("-- :: STOP PART :: --");
        const {jsonst} = this.state;
        const {arch_src, main_src} = this.state.config;
        const {capture_id} = jsonst;
        this.makeDelay("next");
        mqtt.send("stop", false, "exec/service/"+arch_src+"/sdi", 1);
        mqtt.send("stop", false, "exec/service/"+main_src+"/sdi", 1);
        jsonst.action = "stop";
        jsonst.isRec = false;
        jsonst.next_part = true;
        jsonst.num_prt.part++;
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture, 1);
        setTimeout(() => {
            mqtt.send(JSON.stringify({action: "stop", id: capture_id}), false, "workflow/service/capture/" + arch_src, 1);
            mqtt.send(JSON.stringify({action: "stop", id: capture_id}), false, "workflow/service/capture/" + main_src, 1);
            this.nextPart();
        }, 3000);
    };

    nextPart = () => {
        setTimeout(() => {
            this.state.main_online ? this.nextPart() : this.startPart();
        }, 3000);
    };

    setOptions = (jsonst, presets) => {
        console.log("[capture] Set options for: ", presets);
        let options = [];
        let lines = {};
        for(let d in presets) {
            // Here we iterate dynamic presets
            const cur_date = moment().format('YYYY-MM-DD');
            if(d === cur_date) {
                options.push({key: d, text: '', value: d, disabled: true, label: d})
                const preset = presets[d];
                for(let i in preset) {
                    let {name, id, line} = preset[i];
                    lines[id] = line;
                    name = name.replace("yyyy-mm-dd", cur_date);
                    options.push({key: id, text: name, value: id})
                }
            }
            // Here we iterate constant presets
            if(d === "recent") {
                options.push({key: d, text: '', value: d, disabled: true, label: d})
                const preset = presets[d];
                for(let i in preset) {
                    let {name, id, line} = preset[i];
                    lines[id] = line;
                    name = name.replace("DATE", cur_date);
                    name = name.replace("yyyy-mm-dd", cur_date);
                    name = name.replace("NUM", "n" + jsonst.num_prt[line.content_type]);
                    name = name.replace("PRT", "p" + jsonst.num_prt.part);
                    options.push({key: id, text: name, value: id})
                }
            }
        }
        this.setState({options, lines}, () => {
            if(jsonst.isRec && jsonst.line && this.state.recover) {
                // Here we need put selected option in ui only
                // when page opened and record already stated
                console.log("-- Capture started! --");
                this.setState({recover: false, line_id: jsonst.line_id});
            } else {
                this.setState({recover: false});
            }
        });
    };

    setLine = (line_id, jsonst) => {
        const {lines, options} = this.state;
        let line = lines[line_id];
        const final_name = options.find(i => i.value === line_id)?.text;
        if(!final_name) {
            console.error("[capture] Something wrong with preset");
            return;
        }
        let num = jsonst.num_prt[line.content_type];
        let prt = jsonst.num_prt.part;
        let psdate = moment.unix(jsonst.capture_id.substr(1).slice(0,-3)).format('YYYY-MM-DD');
        line.final_name = final_name.replace("DATE", psdate);
        line.final_name = final_name.replace("yyyy-mm-dd", psdate);
        line.final_name = final_name.replace("NUM", "n"+num);
        line.final_name = final_name.replace("PRT", "p"+prt);
        line.part = (line.collection_type === "CONGRESS") ? line.part : prt;
        line.number = (line.collection_type === "CONGRESS") ? line.number : num;
        line.holiday = jsonst.isHag;
        line.capture_date = jsonst.date;
        if(line.content_type === "LESSON_PART") {
            line.lid = jsonst.backup_id;
        }
        if(jsonst.ishag) {
            line.hag = jsonst.holidayname;
            line.week_date = jsonst.weekdate;
            line.chol_date = jsonst.choldate;
        }
        return line;
    }

    saveLine = (line_id) => {
        const {lines, jsonst} = this.state;
        console.log("[capture] Save state: ", lines[line_id]);
        this.setState({line_id});
        jsonst.line = this.setLine(line_id, jsonst);
        jsonst.line_id = line_id;
        jsonst.action = "line";
        jsonst.stop_name = jsonst.line.final_name;
        console.log("-- Store line in state: ", jsonst);
        setIngestState(this.props.capture, jsonst, data => {
            console.log(" :: setIngestState: ", data);
        });
        mqtt.send(JSON.stringify(jsonst), true, "workflow/state/capture/" + this.props.capture, 1);
        //FIXME: Here we must be sure that line already in state!
        console.log("-- Set line in WFDB -- ");
        setTimeout(() => {
            this.setWorkflow("line");
        }, 3000);
    };

    setWorkflow = (action) => {
        const {arch_src, main_src, backup_src} = this.state.config;
        const {capture_id, backup_id} = this.state.jsonst;
        if(this.props.capture === "multi")
            mqtt.send(JSON.stringify({action, id: capture_id}), false, "workflow/service/capture/" + arch_src, 1);
        mqtt.send(JSON.stringify({action, id: capture_id}), false, "workflow/service/capture/" + main_src, 1);
        mqtt.send(JSON.stringify({action, id: backup_id}), false, "workflow/service/capture/" + backup_src, 1);
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
        const {jsonst,config,main_online,backup_online,main_timer,backup_timer,start_loading,next_loading,stop_loading,options,line_id} = this.state;
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
                                    disabled={next_loading || backup_online || start_loading}
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
                                    disabled={line_id === "" || !backup_online || stop_loading}
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
                    error={!line_id}
                    scrolling={false}
                    placeholder={backup_online ? "--- SET PRESET ---" : "--- PRESS START ---"}
                    selection
                    value={line_id}
                    disabled={jsonst?.next_part || !backup_online}
                    options={options}
                    onChange={(e,{value}) => this.saveLine(value)}
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
