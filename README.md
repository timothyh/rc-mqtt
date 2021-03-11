# rc-mqtt
Gateway from libinput to MQTT

Reads events from IR receiver input device (/dev/input/event0) and publishes to MQTT

Event code mapping is done in user space using both system keymaps (/lib/udev/rc_keymap) and local keymaps (./rc_keymap)

Unidentified codes are published as numeric values

There is also provision for custom modules to handle specific remotes:-
* Roku - Initial down press uses different code. Also varients of remote use different codes.
  This may be obvious, but this only works with IR based Roku remotes, effectively the cheap ones
* Tivo - Tivo allows for multiple instances (0-9) each with different codes
  To change remote instance #, press Tivo + Pause for 5 seconds, indicator goes solid red. Press instance # - Default is 0.

This works very nicely with Raspberry Pi Zero with an IR receiver.
More information on hardware setup:-
https://blog.gordonturner.com/2020/05/31/raspberry-pi-ir-receiver/

Designed to use nodejs version native to Raspberry Pi OS/Debian

## Installation

Assuming git repo cloned to /opt/rc-mqtt

```
# useradd -r nodejs -G video,input
# apt install nodejs npm ir-keytable
# cd /opt/rc-mqtt
# npm install
Create/update config.json
# cp -p rc-mqtt.service /etc/systemd/system
# cp -p rc-mqtt.sudo /etc/sudoers.d/010_nodejs-nopasswd
# systemctl daemon-relead
# systemctl enable --now rc-mqtt
# systemctl
