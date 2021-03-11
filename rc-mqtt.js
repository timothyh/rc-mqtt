"use strict"

const fs = require("fs")
const util = require("util")
const stringify = require('json-stable-stringify')
const mqtt = require("mqtt")

const mh = require('./my-helpers')
const ir_rc = require('./ir-rc')

var config = mh.readConfig('./config.json')

const startTime = Date.now()
var mqttActivity = Date.now()

var mqttConf = config.mqtt_conf

var keepaliveInterval = 60000
var inactivityTimeout = 90000

if (!mqttConf.host) mqttConf.host = 'localhost'
if (!mqttConf.port) mqttConf.port = 1883
if (!mqttConf.protocol) mqttConf.protocol = 'mqtt'

if (mqttConf.cafile) mqttConf.cacertificate = [fs.readFileSync(mqttConf.cafile)]

// Transition inactivity parameters to MQTT attributes
if (mqttConf.keepalive_interval) keepaliveInterval = mqttConf.keepalive_interval * 1000
if (mqttConf.inactivity_timeout) inactivityTimeout = mqttConf.inactivity_timeout * 1000

var verbose = mh.isTrue(config.verbose)
var debug = mh.isTrue(config.debug)

var mqttClient = mqtt.connect({
    ca: mqttConf.cacertificate,
    host: mqttConf.host,
    port: mqttConf.port,
    username: mqttConf.username,
    password: mqttConf.password,
    protocol: mqttConf.protocol,
    keepalive: mqttConf.keepalive,
    will: {
        topic: mqttConf.will_topic,
        payload: 'stop'
    }
})

mqttClient.on('close', function() {
    console.warn("MQTT connection closed")
    process.exit(1)
})

mqttClient.on('connect', function() {
    console.log("connected to MQTT broker: %s:%s", mqttConf.host, mqttConf.port)
    mqttClient.subscribe(mqttConf.ping_topic)
})

mqttClient.on('message', function(topic, message) {
    mqttActivity = Date.now()
    if (topic === mqttConf.ping_topic) return

    console.warn("Unexpected MQTT message topic: %s message: %s", topic, message)
})

if (keepaliveInterval) {
    setInterval(function() {
        mqttClient.publish(mqttConf.ping_topic, JSON.stringify({
            timestamp: new Date().toISOString()
        }))
    }, keepaliveInterval)
}

if (inactivityTimeout) {
    setInterval(function() {
        var mqttLast = (Date.now() - mqttActivity)
        if (mqttLast >= inactivityTimeout) {
            console.warn("Exit due to MQTT inactivity")
            process.exit(10)
        }
    }, 10000)
}

var input = new ir_rc.IrRc()

input.on('error',function(msg) {
	console.warn(msg)
})

input.loadMaps(config.rc_keymaps, config.rc_modules, config.remotes)

input.on('input', function(remote, key, state, count, code,  duration) {
	if ( verbose ) console.log("Got input: %s key: %s:%s state: %s count: %s code: 0x%s",
			(duration + 0.00049).toFixed(3), remote, key, state,count, code.toString(16).padStart(4,'0'))

	key = key.replace(/^KEY_/,'').toLowerCase(),

        mqttClient.publish(mqttConf.prefix + '/' + remote + '/' + key, JSON.stringify({
		code: '0x' + code.toString(16).padStart(4,'0'),
		count: count,
		duration: (duration + 0.00049).toFixed(3),
		key: key,
		remote: remote,
		state: state,
            timestamp: new Date().toISOString()
        }))
})

input.openInput('*')

mqttClient.publish(mqttConf.will_topic, 'start')
