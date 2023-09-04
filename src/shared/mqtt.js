import * as mqtt from 'mqtt';
import {MQTT_LCL_URL, MQTT_EXT_URL, randomString} from "./tools";

class MqttMsg {

    constructor() {
        this.user = null;
        this.mq = null;
        this.connected = false;
        this.capture = null;
        this.token = null;
    }

    init = (user, callback) => {
        this.user = user;

        const transformUrl = (url, options, client) => {
            client.options.password = this.token;
            return url;
        };

        let options = {
            keepalive: 10,
            connectTimeout: 10 * 1000,
            clientId: user.id + "-" + randomString(5)  ,
            protocolId: 'MQTT',
            protocolVersion: 5,
            clean: true,
            username: user.email,
            password: this.token,
            transformWsUrl: transformUrl,
        };

        const local = true;
        const url = local ? MQTT_LCL_URL : MQTT_EXT_URL;
        this.mq = mqtt.connect(`wss://${url}`, options);

        this.mq.on('connect', (data) => {
            if(data && !this.connected) {
                console.log("[mqtt] Connected to server: ", data);
                this.connected = true;
                callback(data)
            }
        });

        this.mq.on('error', (data) => console.error('[mqtt] Error: ', data));
        this.mq.on('disconnect', (data) => console.error('[mqtt] Error: ', data));
    }

    join = (topic, qos) => {
        console.debug("[mqtt] Subscribe to: ", topic)
        let options = {qos, nl: false}
        this.mq.subscribe(topic, {...options}, (err) => {
            err && console.error('[mqtt] Error: ', err);
        })
    }

    exit = (topic) => {
        let options = {}
        console.debug("[mqtt] Unsubscribe from: ", topic)
        this.mq.unsubscribe(topic, {...options} ,(err) => {
            err && console.error('[mqtt] Error: ',err);
        })
    }

    send = (message, retain, topic, qos) => {
        if(message !== "status")
            console.debug("[mqtt] Send data on topic: ", topic, message)
        let options = {qos, retain};
        this.mq.publish(topic, message, {...options}, (err) => {
            err && console.error('[mqtt] Error: ',err);
        })
    }

    watch = (callback, stat) => {
        this.mq.on('message',  (topic, data, packet) => {
            //console.debug("[mqtt] message: ", JSON.parse(data.toString()), ", on topic: ", topic);
            const topic_state = 'workflow/state/capture/' + this.capture
            if (topic_state === topic) {
                console.debug("[mqtt] State from topic: ", topic);
                this.mq.emit('state', JSON.parse(data.toString()));
            } else {
                let message = stat ? data.toString() : JSON.parse(data.toString());
                if(message.action === "status")
                    return
                console.debug("[mqtt] message: ", message, ", on topic: ", topic);
                callback(message, topic)
            }
        })
    }

    setToken = (token) => {
        this.token = token;
    }

    setCapture = (capture) => {
        this.capture = capture;
    }

}

const defaultMqtt = new MqttMsg();

export default defaultMqtt;



