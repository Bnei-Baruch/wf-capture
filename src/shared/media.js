import {Janus} from "../lib/janus";
import {JNS_SRV, JNS_STUN} from "./tools";


class Media {

    constructor() {
        this.janus = null;
        this.videostream = null;
        this.audiostream = {};
    }

    init = (cb) => {
        Janus.init({
            debug: process.env.NODE_ENV !== 'production' ? ["error"] : ["error"],
            callback: () => {
                let janus = new Janus({
                    server: JNS_SRV,
                    iceServers: [{urls: JNS_STUN}],
                    success: () => {
                        Janus.log(" :: Connected to JANUS");
                        this.janus = janus;
                        cb(true)
                    },
                    error: (error) => {
                        Janus.log(error + " -- reconnect after 10 sec");
                        this.reinit();
                    },
                    destroyed: () => {
                        Janus.log(" :: Janus destroyed -- reconnect after 10 sec :: ");
                        this.reinit();
                    }
                });
            }
        })
    };

    reinit = () => {
        setTimeout(() => {
            this.init();
        }, 5000);
    };

    initVideoStream = (id, cb) => {
        this.janus.attach({
            plugin: "janus.plugin.streaming",
            opaqueId: "videostream-"+Janus.randomString(12),
            success: (videostream) => {
                this.videostream = videostream;
                videostream.send({message: {request: "watch", id: id}});
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            iceState: (state) => {
                Janus.log("ICE state changed to " + state);
            },
            webrtcState: (on) => {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            slowLink: (uplink, lost, mid) => {
                Janus.log("Janus reports problems " + (uplink ? "sending" : "receiving") +
                    " packets on mid " + mid + " (" + lost + " lost packets)");
            },
            onmessage: (msg, jsep) => {
                this.onStreamingMessage(this.videostream, msg, jsep, false);
            },
            onremotetrack: (track, mid, on) => {
                Janus.debug(" ::: Got a remote video track event :::");
                Janus.debug("Remote video track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
                if(!on) return;
                let stream = new MediaStream();
                stream.addTrack(track.clone());
                Janus.log("Created remote video stream:", stream);
                cb(stream)
            },
            oncleanup: () => {
                Janus.log("Got a cleanup notification");
            }
        });
    };

    initAudioStream = (id, i, cb) => {
        this.janus.attach({
            plugin: "janus.plugin.streaming",
            opaqueId: "audiostream-"+Janus.randomString(12),
            success: (handle) => {
                Janus.log(handle);
                this.audiostream[i] = handle
                this.audiostream[i].send({message: {request: "watch", id: id}});
                this.audiostream[i].muteAudio();
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            iceState: (state) => {
                Janus.log("ICE state changed to " + state);
            },
            webrtcState: (on) => {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            slowLink: (uplink, lost, mid) => {
                Janus.log("Janus reports problems " + (uplink ? "sending" : "receiving") +
                    " packets on mid " + mid + " (" + lost + " lost packets)");
            },
            onmessage: (msg, jsep) => {
                this.onStreamingMessage(this.audiostream[i], msg, jsep, false);
            },
            onremotetrack: (track, mid, on) => {
                Janus.debug(" ::: Got a remote audio track event :::");
                Janus.debug("Remote audio track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
                let stream = new MediaStream();
                stream.addTrack(track.clone());
                Janus.log("Created remote audio stream:", stream);
                cb(stream)
            },
            oncleanup: () => {
                Janus.log("Got a cleanup notification");
            }
        });
    };

    onStreamingMessage = (handle, msg, jsep, initdata) => {
        Janus.log("Got a message", msg, handle);

        if(jsep !== undefined && jsep !== null) {
            Janus.log("Handling SDP as well...", jsep);

            // Answer
            handle.createAnswer({
                jsep: jsep,
                media: { audioSend: false, videoSend: false, data: initdata },
                success: (jsep) => {
                    Janus.log("Got SDP!", jsep);
                    let body = { request: "start" };
                    handle.send({message: body, jsep: jsep});
                },
                customizeSdp: (jsep) => {
                    Janus.debug(":: Modify original SDP: ",jsep);
                    jsep.sdp = jsep.sdp.replace(/a=fmtp:111 minptime=10;useinbandfec=1\r\n/g, 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1\r\n');
                },
                error: (error) => {
                    Janus.log("WebRTC error: " + error);
                }
            });
        }
    };

}

const defaultMedia = new Media();

export default defaultMedia;