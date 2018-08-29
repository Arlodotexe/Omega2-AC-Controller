'use strict';
const pwmExp = require('/usr/bin/node-pwm-exp');
const requestify = require('requestify');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const port = 8084;
let currentState;
let oscStatus = false;
pwmExp.driverInit();

function debounce(func, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

(function getState() {
    currentState = require('./state.json').state;
    return currentState;
})();

let sys = {
    error: function(message) {
        requestify.post('http://192.168.0.100:8082/', {
            'error': 'Omega2 on thermostat: ' + message,
            'receivingDevice': 'Omega2 Thermostat controller'
        });
    },
    log: function(message) {
        console.log(message);
        requestify.post('http://192.168.0.100:8082/', {
            'log': 'Omega2 on thermostat: ' + message
        });
    },
    speak: function(msg) {
        requestify.post('http://192.168.0.100:8082/', {
            'speak': msg
        });
    }
}

if (pwmExp.checkInit()) {
    'use strict';
    pwmExp.setFrequency(50);
    sys.log('Oscillator sucessfully initialized');
    oscStatus = true;
} else {
    sys.error('Error with oscillator initializing');
}

function parseForPWM(int) {
    return (100 - int) * 0.13;
}


function isOnline() {
    return new Promise(resolve => {
        debounce(exec('ping -c 1 1.1.1.1', (err, stdout) => {
            if (err) error(err);
            if (stdout.includes('0% packet loss')) {
                resolve(true);
            } else {
                log('Device has gone offline. Restarting network server...');
                debounce(exec('service network restart', () => {
                    setTimeout(() => {
                        isOnline().then(result => {
                            if (!result) {
                                log('Restarting network service didn\'t work. Forcing a reboot');
                                exec('reboot -f');
                            }
                        });
                    }, 2000);
                }), 5000);
            }
        }), 5000);
    });
}

setInterval(_ => {
    isOnline();
}, 20 * 60 * 1000);

app.get('/status', (req, res) => {
    isOnline().then(function(result) {
        res.json({
            currentState: currentState,
            isOnline: result
        });
    })
});

app.post('/', function(req, res) {
    'use strict';
    let body = req.body;
    Object.keys(body).forEach(function(key, index) {

        if (!body.set) {
            sys.error('No set value supplied');
        } else {
            sys.log('Setting to ' + body.set);
            switch (body.set) {
                case 'lowfan':
                    pwmExp.setupDriver(0, parseForPWM(25), 0);
                    break;
                case 'highfan':
                    pwmExp.setupDriver(0, parseForPWM(5), 0);
                    break;
                case 'highcool':
                    pwmExp.setupDriver(0, parseForPWM(77), 0);
                    break;
                case 'lowcool':
                    pwmExp.setupDriver(0, parseForPWM(64), 0);
                    break;
                case 'off':
                    pwmExp.setupDriver(0, parseForPWM(43), 0);
                    break;
                default:
                    if (!isNaN(body.set)) {
                        pwmExp.setupDriver((body.driver ? parseInt(body.driver) : 0), parseForPWM(body.set), 0);
                    }
            }
            fs.writeFileSync('./state.json', JSON.stringify({ state: body.set }));
            getState();
        }
    });
});

app.listen(port, function(err) {
    'use strict';
    if (err) sys.error(err);
    sys.log('Listening on port ' + port);
    if (oscStatus) sys.speak('AC Controller is ready');
});