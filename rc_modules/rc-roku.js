'use strict'

const util = require("util")

module.exports._protocol = "nec"

var _rokuKeys = {
    0x03: "KEY_HOME",
    0x0f: "KEY_VOLUMEUP",
    0x10: "KEY_VOLUMEDOWN",
    0x17: "KEY_POWER",
    0x19: "KEY_UP",
    0x1e: "KEY_LEFT",
    0x20: "KEY_MUTE",
    0x2a: "KEY_ENTER",
    0x2d: "KEY_RIGHT",
    0x33: "KEY_DOWN",
    0x34: "KEY_REWIND",
    0x4c: "KEY_PLAY",
    0x55: "KEY_FORWARD",
    0x61: "KEY_INFO",
    0x66: "KEY_BACK",
    0x78: "KEY_BACKSPACE"
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

    // Is this a roku code?
    if (!(0xeac000 === (code & 0xfff000))) return undefined

    // Repeat
    if ((code & 0x80) != 0) {
        // repeat
        if (state === 'press') state = 'hold'
    } else {
        // Not repeat
        if (state === 'hold') return false
    }

    var unit = (code & 0xf00) >> 8
    var remote = 'roku' + ((unit === 7) ? '' : '%' + unit.toString(16))

    var keyCode = code & 0x7f
    var key = _rokuKeys[keyCode] ? _rokuKeys[keyCode] : '0x' + keyCode.toString(16).padStart(2,'0')

    return {
        "remote": remote,
        "key": key,
        "state": state,
        "code": code
    }
}

// _lookupKey(0xeac717)
// _lookupKey(0xeac797)

// _lookupKey(0xeac796)

// _lookupKey(15385139)
// _lookupKey(15385267)
// _lookupKey(0x69)

/*
prefix = EACXXX
instance = X00
repeat = 8X

channel keys

 * 06 = "KEY_SLING"
 * 08 = "KEY_VUDU"
 * 4b = "KEY_AMAZON"
 * 4d = "KEY_HULU"
 * 52 = "KEY_NETFLIX"
 * 6c = "KEY_HBONOW"
 * 7f = "KEY_RDIO"
 * */
