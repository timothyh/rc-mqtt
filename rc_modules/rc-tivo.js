'use strict'

const util = require("util")

module.exports._protocol = "nec"

var _tivoKeys = {
    0x708d: "BACK",
    0x9060: "YELLOW",
    0x9061: "BLUE",
    0x9062: "RED",
    0x9063: "GREEN",
    0xa05f: "CYCLEWINDOWS",
    0xb044: "WINDOW",
    0xb048: "STOP",
    0xb04a: "DVD",
    0xc030: "NUMERIC_9",
    0xc031: "NUMERIC_0",
    0xc032: "CLEAR",
    0xc033: "ENTER",
    0xc034: "INPUT",
    0xc036: "GUIDE",
    0xd020: "RECORD",
    0xd021: "PLAY",
    0xd022: "REWIND",
    0xd023: "PAUSE",
    0xd024: "FASTFORWARD",
    0xd025: "SLOW",
    0xd026: "PREVIOUS",
    0xd027: "NEXT",
    0xd028: "NUMERIC_1",
    0xd029: "NUMERIC_2",
    0xd02a: "NUMERIC_3",
    0xd02b: "NUMERIC_4",
    0xd02c: "NUMERIC_5",
    0xd02d: "NUMERIC_6",
    0xd02e: "NUMERIC_7",
    0xd02f: "NUMERIC_8",
    0xe010: "POWER",
    0xe011: "LIVETV",
    0xe013: "INFO",
    0xe014: "UP",
    0xe015: "RIGHT",
    0xe016: "DOWN",
    0xe017: "LEFT",
    0xe018: "THUMBSDOWN",
    0xe019: "SELECT",
    0xe01a: "THUMBSUP",
    0xe01b: "MUTE",
    0xe01c: "VOLUMEUP",
    0xe01d: "VOLUMEDOWN",
    0xe01e: "CHANNELUP",
    0xe01f: "CHANNELDOWN",
    0xf007: "TIVO"
}

var _tivoExceptions = {
    0x3007: [8, "TIVO"],
    0x3016: [9, "DOWN"],
    0x3017: [8, "LEFT"],
    0x3018: [7, "THUMBSDOWN"],
    0x3019: [6, "SELECT"],
    0x301a: [5, "THUMBSUP"],
    0x301b: [4, "MUTE"],
    0x301c: [3, "VOLUMEUP"],
    0x301d: [2, "VOLUMEDOWN"],
    0x301e: [1, "CHANNELUP"],
    0x301f: [0, "CHANNELDOWN"],
    0x3026: [9, "PREVIOUS"],
    0x3027: [8, "NEXT"],
    0x3028: [7, "NUMERIC_1"],
    0x3029: [6, "NUMERIC_2"],
    0x302a: [5, "NUMERIC_3"],
    0x302b: [4, "NUMERIC_4"],
    0x302c: [3, "NUMERIC_5"],
    0x302d: [2, "NUMERIC_6"],
    0x302e: [1, "NUMERIC_7"],
    0x302f: [0, "NUMERIC_8"],
    0x3036: [9, "GUIDE"],
}

module.exports.initModule = function() {
    return true
}

// return undefined => I don't recognize the code
// return false => Ignore this code
// Otherwise return (remote, key, state, code)
// Note state may be changed from input value
//
module.exports.lookupKey = function(state, code) {
    // console.log("lookupKey: %s: %s", state, code)

    // Is this a tivo code?
    var prefix = code & 0xffff0000
    var unit
    var key

    if (prefix === 0x00850000) {
        var keyCode = code & 0xffff

        if (_tivoExceptions[keyCode]) {
            var tmp = _tivoExceptions[keyCode]
            unit = tmp[0]
            key = 'KEY_' + tmp[1]
        }
    } else if (prefix === 0x30850000) {
        unit = (code & 0x0f00) >> 8

        var keyCode = code & 0xf0ff

        if (_tivoKeys[keyCode]) key = 'KEY_' + _tivoKeys[keyCode]

        // console.log(util.inspect(res))

    }

    if (key) {
        var remote = 'tivo' + ((unit === 0) ? '' : '%' + unit.toString(16))
        return {
            "remote": remote,
            "key": key,
            "state": state,
            "code": code
        }
    }
    return undefined
}

