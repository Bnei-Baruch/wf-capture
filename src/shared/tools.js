import moment from "moment";
import Hebcal from "hebcal";

export const BACKUPCAP = process.env.REACT_APP_BACKUPCAP;
export const MAINCAP = process.env.REACT_APP_MAINCAP;
export const MLTBACKUP = process.env.REACT_APP_MLTBACKUP;
export const MLTCAP = process.env.REACT_APP_MLTCAP;
export const TEST = process.env.REACT_APP_TEST;
export const MQTT_LCL_URL = process.env.REACT_APP_MQTT_LCL_URL;
export const MQTT_EXT_URL = process.env.REACT_APP_MQTT_EXT_URL;
export const JNS_SRV = process.env.REACT_APP_JNS_SRV;
export const JNS_STUN = process.env.REACT_APP_JNS_STUN;


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
    return config
}

export const newCaptureState = () => {
    let capture_id = "c"+moment().format('x');
    let lid = "c"+(Number(moment().format('x'))+3)
    let startname = moment().format('YYYY-MM-DD_HH-mm-ss');
    let numprt = {"LESSON_PART": 1, "MEAL": 1,"FRIENDS_GATHERING": 1,"UNKNOWN": 1, "part": 0};
    let jsonst = {capture_id, lid, next_part: false, startname, numprt};
    jsonst = setDate(jsonst);
    return jsonst
}

const setDate = (jsonst) => {
    const {capture_id} = jsonst;
    let mtime = moment.unix(capture_id.substr(1).slice(0,-3))._d;
    let curdate = moment.unix(capture_id.substr(1).slice(0,-3)).format('YYYY-MM-DD');
    jsonst.date = curdate;
    console.log("-- Set date: "+curdate);
    let ishag = getHoliday(mtime);
    jsonst.ishag = ishag;
    console.log("-- The hag is: "+ishag);
    if(ishag) {
        let holidayname = getHolidayname(mtime);
        jsonst.holidayname = holidayname;
        let weekdate = getWeekdate(mtime);
        // This was in old workflow when we set chol date.
        // in MDB it's use for set film_date so we store chol date
        // in onather propery
        //jsonst.weekdate = weekdate;
        jsonst.choldate = weekdate
        jsonst.weekdate = curdate;
        console.log("Hag name: "+holidayname);
        console.log("Week date: "+weekdate);

    }

    return jsonst
    // This was in old workflow when we need n++ during all special days
    //var reqdate = ishag ? weekdate : curdate;

    //TODO: WTF?
    // let reqdate = curdate;
    // jsonst.reqdate = reqdate;
    // if(!jsonst.next_part) { setState(); }
    // getNumprt(jsonst.reqdate);
}

// function checkHoliday() {
//     var hag = getHoliday();
//     console.log("-- Holiday on Stop is: ",hag);
//     if(jsonst.ishag === false && hag === true) {
//         console.log("-- We start before holiday and stop after! --");
//         jsonst.line.holiday = true;
//         jsonst.line.hag = getHolidayname();
//         jsonst.line.week_date = jsonst.line.capture_date;
//         jsonst.line.chol_date = jsonst.line.capture_date;
//         // If this check will on stopPart we need setState() here
//         wfdbPost(jsonst.line);
//     }
// }

// function getNumprt(reqdate) {
//     console.log("-- GET numprt with date: "+reqdate);
//     $.getJSON( "http://"+wfdb+"/state/ingest/numprt",function(data) {
//         numprt = data;
//         if(numprt.date !== reqdate) {
//             numprt = { "date": reqdate, "LESSON_PART": 1, "MEAL": 1,"FRIENDS_GATHERING": 1,"UNKNOWN": 1, "part": 0};
//             console.log("Set new: ",numprt);
//             setNumprt(reqdate, numprt);
//         }
//         console.log("Got numprt: ",numprt);
//         getOptions(numprt);
//     })
//         .fail(function() {
//             console.log("FAIL: Error DB connectin.");
//             // TODO: Here we need logic to set numprt in failmode
//             numprt = { "date": reqdate, "LESSON_PART": 1, "MEAL": 1,"FRIENDS_GATHERING": 1,"UNKNOWN": 1, "part": 0};
//             console.log("Set new numbers: ",numprt);
//             setNumprt(reqdate, numprt);
//             getOptions(numprt);
//         });
// }
//
// function setNumprt(reqdate, numprt) {
//     console.log("-- SET Number and Parts",numprt);
//     $.ajax({
//         type: 'PUT',
//         contentType: 'application/json',
//         url: 'http://'+wfdb+'/state/ingest/numprt',
//         data: JSON.stringify(numprt),
//         success: function(data) {
//             console.log("numprt saved: ",data);
//         },
//         error: function(data) {
//             console.log("ERROR: Set numprt: ",data);
//             jsonst["numprt"] = numprt;
//             setState();
//         }
//     })
//         .fail(function() {
//             console.log("FAIL: Error DB connectin.");
//             jsonst["numprt"] = numprt;
//             setState();
//         });
// }

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

export const totalSeconds = (time) => {
    let parts = time.split(':');
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

export const getPercent = (total,current) => {
    let percent = (100 * totalSeconds(current) / totalSeconds(total)).toFixed(0);
    percent = +percent || 0;
    return percent;
};

export const streamFetcher = (data, cb) => fetch(`http://10.66.3.16:8081`)
    .then((response) => {
        if (response.ok) {
            return response.json().then(respond => cb(respond));
        } else {
            return null
        }
    })

export const getData = (cb) => fetch("http://wfsrv.bbdomain.org/wfdb/names", {
        headers: {'Content-Type': 'application/json'}
    })
    .then((response) => {
        if (response.ok) {
            return response.json().then(data => cb(data));
        }
    })
    .catch(ex => console.log(`getData`, ex));


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
