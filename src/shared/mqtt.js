import mqtt from 'mqtt';
import {MQTT_LCL_URL, MQTT_EXT_URL} from "./tools";

class MqttMsg {

    constructor() {
        this.user = null;
        this.mq = null;
        this.connected = false;
        this.room = null;
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
            clientId: user.id,
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

    join = (topic) => {
        console.debug("[mqtt] Subscribe to: ", topic)
        let options = {qos: 1, nl: true}
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

    send = (message, retain, topic) => {
        //console.debug("[mqtt] Send data on topic: ", topic, message)
        let options = {qos: 1, retain};
        this.mq.publish(topic, message, {...options}, (err) => {
            err && console.error('[mqtt] Error: ',err);
        })
    }

    watch = (callback, stat) => {
        this.mq.on('message',  (topic, data, packet) => {
            console.debug('[mqtt] Got data on topic: ', topic);
            if (/workflow/.test(topic)) {
                this.mq.emit('workflow', JSON.parse(data.toString()));
            } else {
                let message = stat ? data.toString() : JSON.parse(data.toString());
                console.debug("[mqtt] message: ", message);
                callback(message, topic)
            }
        })
    }

    setToken = (token) => {
        this.token = token;
    }

}

const defaultMqtt = new MqttMsg();

export default defaultMqtt;



