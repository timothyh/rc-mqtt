'use strict'

const fs = require('fs')
const EventEmitter = require('events').EventEmitter

const path = require('path')
const toml = require('toml')
const util = require('util')

util.inspect.defaultOptions.maxArrayLength = null
util.inspect.defaultOptions.depth = null

/*
   Event Types
   From /usr/include/linux/input-event-codes.h
*/

const eventTypes = ['EV_SYN', 'EV_KEY', 'EV_REL', 'EV_ABS', 'EV_MSC', 'EV_SW']
const _keySep = ':'

class IrRc extends EventEmitter {
    constructor() {
        super()

        this._protocols = {}
        this._irCodes = {}
        this._rcModules = []

        this._repeatInterval = 0.12
        this._currentValue = undefined
        this._startTime = undefined
        this._prevTime = undefined
        this._pressCount = 0
    }

    destroy() {}

    openInput(rc = '*') {
        var self = this

        var res = require('child_process').spawnSync(
            'find /sys/class/rc/' + rc + '/* -name event* -type d', {
                shell: true
            }
        )

        if (res.status !== 0) {
            console.log((res.stdout + res.stderr).toString().replace(/\s+/g, ' '))
            self.emit('error',
                (res.stdout + res.stderr).toString().replace(/\s+/g, ' '))
            return
        }

        res = res.stdout.toString().split("\n")[0].split('/')

        rc = res[4]
        var input = '/dev/input/' + res[6]

        if (IrRc.verbose) console.log("sysdev = %s, input = %s", rc, input)

        if (!fs.existsSync(input)) {
            console.warn("%s: No such device", input)
            self.emit('error', "%s: No such device", input)
            return
        }

        // sanitize protocol list as command will be executed as root
        var protoStr = Object.keys(this._protocols).sort().join(',').replace(/[^a-z0-9,_-]/gi, '')
        var cmd = 'sudo ir-keytable -s ' + rc + ' -p ' + protoStr
        if (IrRc.verbose) console.log("executing %s", cmd)
        var res = require('child_process').spawnSync(
            cmd, {
                shell: true
            }
        )

        // console.log(util.inspect(res))

        if (res.status !== 0) {
            switch (res.status) {
                //res.status === 127 - Command Not found
                case 127:
                    console.warn("Unable to execute ir-keytable - Is it installed?")
                    self.emit('error', "Unable to execute ir-keytable - Is it installed?")
                    break
                    // Error
                case 255:
                    console.warn("Unable to initialize device: %s", rc)
                    self.emit('error', "Unable to initialize device: %s", rc)
                    break
            }

            console.warn((res.stdout + res.stderr).toString().replace(/\s+/g, ' '))
            // self.emit('error', (res.stdout + res.stderr).toString().replace(/\s+/g, ' '))

            process.exit(1)
        }

        console.log(res.stderr.toString().replace(/\s+/g, ' '))

        fs.open(input, 'r', function(err, fd) {
            if (err) {
                console.warn("%s: %s", input, err.replace(/\s+/g, ' '))
                self.emit('error', err)
                return
            }
            if (IrRc.verbose) console.log("opened " + input)

            self._fd = fd
            self._bufferSize = (process.arch === 'x64') ? 24 : 16

            self._readInput()
        })
    }

    _loadModules(rc_modules) {
        for (const dirpath of rc_modules.reverse()) {
            if (!fs.existsSync(dirpath)) {
                if (IrRc.verbose) console.log("rc_module directory: " + dirpath + ": does not exist")
                this.emit('error', "rc_module directory: " + dirpath + ": does not exist")
                continue
            }

            for (const file of fs.readdirSync(dirpath).sort()) {
                if (!file.match(/rc-[a-z0-9_-]+\.js$/i)) continue

                var path = dirpath + '/' + file

                try {
                    var tmp = require(path)
                    if (tmp.initModule()) {
                        var proto = tmp._protocol
                        if (proto) {
                            if (!this._protocols[proto]) this._protocols[proto] = 0
                            this._protocols[proto]++
                        }
                        this._rcModules.push(tmp)
                        if (IrRc.verbose) console.log("loaded module: %s protocol: %s", path, proto)
                    }

                } catch (err) {
                    console.warn("module %s: ", path, err.toString().replace(/\s+/g, ' '))
                    this.emit('error', path + ': ' + err)
                }
            }
        }
    }

    loadMaps(rc_keymaps, rc_modules, remotes = undefined) {
        var self = this

        var mapCount = 0

        for (const dirpath of rc_keymaps.reverse()) {
            if (!fs.existsSync(dirpath)) {
                if (IrRc.verbose) console.log("rc_map directory: " + dirpath + ": does not exist")
                self.emit('error', "rc_map directory: " + dirpath + ": does not exist")
                continue
            }

            for (const file of fs.readdirSync(dirpath).sort()) {
                if (!file.match(/.toml$/i)) continue

                var path = dirpath + '/' + file

                var str = fs.readFileSync(path).toString()

                var rc_map
                var dups = []
                var err = false

                while (true) {
                    try {
                        rc_map = toml.parse(str)
                    } catch (e) {
                        err = true
                        if (e.message.match(/Cannot redefine existing key/)) {
                            var tmpstr = str.split(/\n/)
                            if (tmpstr[e.line - 1].match(/KEY_/)) {
                                dups.push(tmpstr[e.line - 1])
                                tmpstr[e.line - 1] = '#'
                                str = tmpstr.join("\n")
                                err = false
                            }
                        }
                        if (err) console.warn(path + ": Error line: " + e.line + ", column: " + e.column + ": " + e.message)
                    }

                    if (rc_map || err) break
                }

                if (!rc_map) {
                    console.warn(path + ": Unable to parse")
                    self.emit('error', path + ": Unable to parse")
                    continue
                }

                if (rc_map.protocols.length > 1) {
                    console.log(path + ": multiple RC definitions in file")
                    self.emit('error', path + ": multiple RC definitions in file")
                }

                mapCount++
                var rc = rc_map.protocols[0]

                if (remotes && !remotes.includes(rc.name)) continue

                if (!this._protocols[rc.protocol]) this._protocols[rc.protocol] = 0
                this._protocols[rc.protocol]++

                for (let sc in rc.scancodes) {
                    var code = parseInt(sc)
                    var keyName = rc.name + _keySep + rc.scancodes[sc]
                    // if (!this._irCodes[code]) this._irCodes[code] = []
                    // this._irCodes[code].push(key)
                    this._irCodes[code] = keyName
                }

                if (dups.length) {
                    for (const dup of dups) {
                        if (!dup.match(/KEY_/)) {
                            console.warn(dup)
                            break
                        }
                        var tmp = dup.split(/\s*=\s*/)
                        var code = parseInt(tmp[0])
                        var keyName = rc.name + _keySep + tmp[1].replace(/"/g, '')
                        // if (!this._irCodes[code]) this._irCodes[code] = []
                        // this._irCodes[code].push(key)
                        this._irCodes[code] = keyName
                    }
                }
            }
        }

        if (rc_modules) this._loadModules(rc_modules)

        return mapCount
    }

    _lookupCode(state, code) {
        var res

        if (this._rcModules) {
            for (const mod of this._rcModules) {
                res = mod.lookupKey(state, code)
                if (res !== undefined) return res
            }
        }

        if (this._irCodes[code]) {
            // var tmp = this._irCodes[code][0].split(_keySep, 2)
            var tmp = this._irCodes[code].split(_keySep, 2)
            res = {
                "remote": tmp[0],
                "key": tmp[1],
                "state": state,
                "code": code
            }
        } else {
            console.log("unexpected key: 0x" + code.toString(16).padStart(4, '0'))
            res = {
                "remote": 'unknown',
                "key": '0x' + code.toString(16).padStart(4, '0'),
                "state": state,
                "code": code
            }
        }
        return res
    }

    _emitEvent(state, keyValue, duration) {

        var res = this._lookupCode(state, keyValue)

        if (!res) return

        var count = 0

        switch (res.state) {
            case 'press':
                this._pressCount = 1
                count = 1
                break
            case 'hold':
                // Edge case when first press is missed
                this._pressCount += 1
                count = this._pressCount
                break
            case 'release':
                count = this._pressCount
                this._pressCount = 0
                break
        }
        this.emit('input', res.remote, res.key, res.state, count, res.code, duration)
    }

    _readInput() {
        var self = this

        var buffer = new Buffer.alloc(this._bufferSize)

        fs.read(this._fd, buffer, 0, buffer.length, null, function(err, bytesRead, buf) {
            if (err) {
                console.warn(err.replace(/\s+/g, ' '))
                self.emit('error', err)
                return
            }

            if (bytesRead != self._bufferSize) {
                console.warn("Bad read - wanted: " + self._bufferSize + " got: " + bytesRead)
                return
            }
            var event = self._parseRemoteEvent(buf);
            // console.log(event)
            var now = ((event.timeS * 1.0) + (event.timeMS / 1000000.0))
            if (self._prevTime > now) {
                console.warn("Bad data in stream")
                return
            }
            if (eventTypes[event.type] === 'EV_MSC') {
                var state = 'press'

                if (event.value === self._currentValue) {
                    var duration = now - self._prevTime
                    if (duration < 0.05) {
                        state = 'ignore';
                    } else if (duration < self._repeatInterval) {
                        state = 'hold';
                    } else {
                        self._startTime = now
                    }
                } else {
                    self._currentValue = event.value
                    self._startTime = now
                }

                if (state !== 'ignore') {
                    clearTimeout(self._releaseTimer)
                    self._releaseTimer = setTimeout(function(keyValue, duration) {
                        self._emitEvent('release', keyValue, duration)
                    }, 50 + (self._repeatInterval * 1000), self._currentValue, now - self._startTime)

                    self._emitEvent(state, self._currentValue, now - self._startTime)

                    if (IrRc.debug) console.log(now, event.code, '0x' + self._currentValue.toString(16).padStart(4, '0'), "=>", key, state, now - self._startTime)

                    self._prevTime = now
                }
            }

            setImmediate(function() {
                self._readInput()
            })
        })
    }

    _parseRemoteEvent(buffer) {

        var event;

        if (process.arch === 'x64') {
            event = {
                timeS: buffer.readUInt64LE(0),
                timeMS: buffer.readUInt64LE(8),
                type: buffer.readUInt16LE(16),
                code: buffer.readUInt16LE(18),
                value: buffer.readInt32LE(20)
            };
        } else { // arm or ia32
            event = {
                timeS: buffer.readUInt32LE(0),
                timeMS: buffer.readUInt32LE(4),
                type: buffer.readUInt16LE(8),
                code: buffer.readUInt16LE(10),
                value: buffer.readInt32LE(12)
            };

        }

        //console.log('%s',event)
        //if ( eventTypes[event.type] === 'EV_MSC' ) console.log(irCodes[event.value])

        return event;
    }
}

IrRc.debug = false
IrRc.verbose = true

module.exports.IrRc = IrRc
module.exports.debug = IrRc.debug
module.exports.verbose = IrRc.verbose
