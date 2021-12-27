import moment from "moment";
import Hebcal from "hebcal";
import mqtt from "../shared/mqtt";

export const BACKUPCAP = process.env.REACT_APP_BACKUPCAP;
export const MAINCAP = process.env.REACT_APP_MAINCAP;
export const MLTBACKUP = process.env.REACT_APP_MLTBACKUP;
export const MLTCAP = process.env.REACT_APP_MLTCAP;
export const MQTT_LCL_URL = process.env.REACT_APP_MQTT_LCL_URL;
export const MQTT_EXT_URL = process.env.REACT_APP_MQTT_EXT_URL;
export const JNS_SRV = process.env.REACT_APP_JNS_SRV;
export const JNS_STUN = process.env.REACT_APP_JNS_STUN;
export const JSDB = process.env.REACT_APP_JSDB_STATE

export const PRESETS = {
        "recent": [
        {
            "id": "l7DZ2lxv",
            "name": "mlt_o_rav_DATE_lesson_NUM_PRT",
            "line": {
                "artifact_type": "main",
                "auto_name": "mlt_o_rav_yyyy-mm-dd_achana_lesson_n1_p0",
                "capture_date": "yyyy-mm-dd",
                "collection_type": "DAILY_LESSON",
                "content_type": "LESSON_PART",
                "final_name": "mlt_o_rav_DATE_lesson_NUM_PRT",
                "has_translation": true,
                "language": "heb",
                "lecturer": "rav",
                "manual_name": null,
                "part": "0",
                "pattern": "lesson",
                "require_test": false,
                "sources": [],
                "tags": []
            }
        },
        {
            "id": "8H3iIRzV",
            "name": "mlt_o_norav_DATE_seuda_NUM",
            "line": {
                "auto_name": "mlt_o_norav_yyyy-mm-dd_seuda_n1",
                "capture_date": "yyyy-mm-dd",
                "collection_type": "MEALS",
                "content_type": "MEAL",
                "final_name": "mlt_o_norav_yyyy-mm-dd_seuda_n1",
                "has_translation": true,
                "language": "heb",
                "lecturer": "norav",
                "manual_name": null,
                "pattern": "meal",
                "require_test": true
            }
        },
        {
            "id": "C1JEylF7",
            "name": "mlt_o_norav_DATE_yeshivat-haverim_NUM",
            "line": {
                "auto_name": "mlt_o_norav_yyyy-mm-dd_yeshivat-haverim_n1",
                "capture_date": "yyyy-mm-dd",
                "collection_type": "WEEKLY_FRIENDS_GATHERING",
                "content_type": "FRIENDS_GATHERING",
                "final_name": "mlt_o_norav_yyyy-mm-dd_yeshivat-haverim_n1",
                "has_translation": true,
                "language": "heb",
                "lecturer": "norav",
                "manual_name": null,
                "pattern": "friends_gathering",
                "require_test": false
            }
        },
        {
            "id": "7G4zzMuC",
            "name": "mlt_o_rav_DATE_unknown_NUM",
            "line": {
                "auto_name": "mlt_o_rav_yyyy-mm-dd_unknown",
                "capture_date": "yyyy-mm-dd",
                "content_type": "UNKNOWN",
                "final_name": "mlt_o_rav_yyyy-mm-dd_unknown",
                "has_translation": true,
                "language": "heb",
                "lecturer": "rav",
                "manual_name": null,
                "require_test": true
            }
        }
    ]
}

export const randomString = (len) => {
    let charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    for (let i = 0; i < len; i++) {
        let randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
};

export const getConfig = (capture) => {
    console.log("Set config for:" + capture);
    let config
    if(capture === 'multi') {
        config = {
            capture,
            header: 'MLT Capture',
            main_src: "mltcap",
            backup_src: "mltbackup",
            main_ip: MLTCAP,
            backup_ip: MLTBACKUP,
            jv_id: 511,
            ja_id: 21,
        }
    }
    if(capture === 'single') {
        config = {
            capture,
            header: 'SDI Capture',
            main_src: "maincap",
            backup_src: "backupcap",
            main_ip: MAINCAP,
            backup_ip: BACKUPCAP,
            jv_id: 521,
            ja_id: 22,
        }
    }
    config.user = {id: capture, email: capture+"@bbdomain.org"};
    mqtt.setCapture(capture);
    return config
}

export const newCaptureState = (jsonst) => {
    let capture_id = "c"+moment().format('x');
    let backup_id = "c"+(Number(moment().format('x'))+3)
    let start_name = moment().format('YYYY-MM-DD_HH-mm-ss');
    jsonst = {...jsonst, backup_id, capture_id, start_name, next_part: false, isRec: true};
    jsonst = setDate(jsonst);
    return jsonst
}

const setDate = (jsonst) => {
    const {capture_id} = jsonst;
    const d = capture_id.substr(1).slice(0,-3);
    let mtime = moment.unix(d)._d;
    let cur_date = moment.unix(d).format('YYYY-MM-DD');
    console.log("-- Set date: "+cur_date);
    if(jsonst.date !== cur_date) {
        jsonst.num_prt = {"LESSON_PART": 1, "MEAL": 1,"FRIENDS_GATHERING": 1,"UNKNOWN": 1, "part": 0};
        console.log("Set new: ",jsonst.num_prt);
    }
    jsonst.date = cur_date;
    jsonst.req_date = cur_date; //FIXME: We still need this property?
    jsonst.isHag = getHoliday(mtime);
    console.log("-- The hag is: "+ jsonst.isHag);
    if( jsonst.isHag) {
        jsonst.holidayname = getHolidayname(mtime);
        // This was in old workflow when we set chol date.
        // in MDB it's use for set film_date so we store chol date
        // in onather propery
        //jsonst.weekdate = getWeekdate(mtime);
        jsonst.choldate = getWeekdate(mtime);
        jsonst.weekdate = cur_date;
        console.log("Hag name: "+jsonst.holidayname);
        console.log("Week date: "+jsonst.choldate);
    }

    return jsonst
    // This was in old workflow when we need n++ during all special days
    //var reqdate = ishag ? weekdate : curdate;
}

const getWeekdate = () => {
    for(let i=0; i<5; i++) {
        let date = moment().add(-i, 'days')._d;
        let iterdate = moment(date).format('YYYY-MM-DD');
        if(getHoliday(date)) continue;
        return iterdate;
    }
}

const getHoliday = (date) => {
    let year = new Hebcal();
    year.il = true;
    year.setCity('Petach Tikvah');
    let holiday = false;
    let d = date || moment()._d;
    let today = year.find(d)[0];
    let h = year.holidays[today.toString()];

    // Detect motze hag
    for(let a in h) {
        if((h[a].YOM_TOV_ENDS === true || h[a].LIGHT_CANDLES_TZEIS === true) && h[a].CHUL_ONLY === false && d < today.sunset()) {
            holiday = true;
            break;
        }
    }

    // Detect erev hag
    if(!holiday) {
        for(let a in h) {
            if(h[a].LIGHT_CANDLES === true && h[a].CHUL_ONLY === false && d > today.sunset()) {
                holiday = true;
                break;
            }
        }
    }

    // In 8.9.2018 hebcal did not detect Shabbat - https://github.com/hebcal/hebcal-js/issues/54
    // The tmp workaround ->
    let datestr = d.toDateString();
    if(!holiday && datestr.match(/^(Fri)/) && d > today.sunset()) {
        holiday = true;
    } else if(!holiday && datestr.match(/^(Sat)/) && d < today.sunset()) {
        holiday = true;
    }
    // <-
    // Fixed (but leave solution)

    return holiday;
}

const getHolidayname = (date) => {
    date = date || moment()._d;
    let year = new Hebcal();
    year.il = true;
    year.setCity('Petach Tikvah');
    let today = year.find(date)[0];

    let h = year.holidays[today.toString()];
    let hag = "hol";
    for(let a in h) {
        if((h[a].YOM_TOV_ENDS === true || h[a].LIGHT_CANDLES_TZEIS === true) && h[a].CHUL_ONLY === false && date < today.sunset()) {
            hag = h[a].desc[0];
            break;
        }
    }

    if(hag === "hol") {
        for(let a in h) {
            if(h[a].LIGHT_CANDLES === true && h[a].CHUL_ONLY === false && date > today.sunset()) {
                hag = h[a].desc[0];
                break;
            }
        }
    }

    let datestr = date.toDateString();
    if(hag === "hol" && datestr.match(/^(Fri)/) && date > today.sunset()) {
        hag = "Shabbat";
    } else if(hag === "hol" && datestr.match(/^(Sat)/) && date < today.sunset()) {
        hag = "Shabbat";
    }

    return hag;
}

export const toHms = (totalSec) => {
    let d = parseInt(totalSec / (3600*24));
    let h = parseInt( totalSec / 3600 , 10) % 24;
    let m = parseInt( totalSec / 60 , 10) % 60;
    let s = (totalSec % 60).toFixed(0);
    if (s < 0) s = 0;
    return (d > 0 ? d + "d " : "") + (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s  < 10 ? "0" + s : s);
};

export const toSeconds = (time) => {
    let parts = time.split(':');
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

export const getPercent = (total,current) => {
    let percent = (100 * toSeconds(current) / toSeconds(total)).toFixed(0);
    percent = +percent || 0;
    return percent;
};

export const getData = (cb) => fetch(`${JSDB}`, {
        headers: {'Content-Type': 'application/json'}
    })
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        } else {
            cb(null)
        }
    })
    .catch(ex => {
        console.log(`getData`, ex);
        cb(null)
    });


const getBufferAverage = (analyser) => {
    let array =  new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(array);
    return getAverageVolume(array);
}

const getAverageVolume = (array) => {
    let values = 0;
    let average;
    let length = array.length;
    for (let i = 0; i < length; i++) {
        values += array[i];
    }
    average = values / length;
    return average;
}

export const streamVisualizer = (remoteStream, canvas, height) => {
    let mn = height/128;

    let drawContext = canvas.getContext('2d');
    let gradient = drawContext.createLinearGradient(0,0,0,height);
    gradient.addColorStop(1,'green');
    gradient.addColorStop(0.85,'#80ff00');
    gradient.addColorStop(0.20,'orange');
    gradient.addColorStop(0,'red');
    let context = new AudioContext();

    let source = context.createMediaStreamSource(remoteStream);
    let analyser1 = context.createAnalyser();
    let analyser2 = context.createAnalyser();
    let splitter = context.createChannelSplitter(2);
    source.connect(splitter);
    splitter.connect(analyser1,0,0);
    splitter.connect(analyser2,1,0);

    let sampleAudioStream = function() {
        let average1 = getBufferAverage(analyser1);
        let average2 = getBufferAverage(analyser2);
        drawContext.clearRect(0, 0, 40, height);
        drawContext.fillStyle=gradient;
        drawContext.fillRect(0,height-average1*mn,10,height);
        drawContext.fillRect(15,height-average2*mn,10,height);
    };

    setInterval(sampleAudioStream, 50);

}
