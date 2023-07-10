<p align="center">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150"><br/>
</p>

## Homebridge-BlueAir
[![Downloads](https://badgen.net/npm/dt/@fjs21/homebridge-blueair)](https://www.npmjs.com/package/@fjs21/homebridge-blueair)
[![Version](https://badgen.net/npm/v/@fjs21/homebridge-blueair)](https://www.npmjs.com/package/@fjs21/homebridge-blueair)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

[![GitHub issues](https://img.shields.io/github/issues/fjs21/homebridge-blueair)](https://github.com/fjs21/homebridge-blueair/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/fjs21/homebridge-blueair)](https://github.com/fjs21/homebridge-blueair/pulls)

## Original plugin not maintained but still available
[Link to Original Plugin Repo](https://github.com/mylesagray/homebridge-blueair)

See Wiki for readme and further details. 

## Update to dynamic platform
The plugin was forked and updated completely to a typescript-based dynamic platform supporting the automatic configuration of devices with just the username and password.

Support for configuration in the Homebridge UI has also been added to simplify setup.

### Installation

```
npm install homebridge-blueair
```

### Features

- ***Easy* configuration - all you need is your username and password to get started.** The defaults work for the vast majority of users.

- **Automatic detection and configuration of multiple BlueAir devices.** By default - all of your supported devices are made available in HomeKit.

- ***NEW* support for AWS-based models such as the HealthProtect and DustMagnet models.** Please check the 'enable AWS API connection' to try out this new feature developed by [@jonato1](https://github.com/jonato1).   

### Supported Devices / Features
| Device                                                   | Air Purifier | LED Status Switch | AQI (PM 1)  | AQI (PM 2.5) | AQI (PM 10) | AQI (tVOC)  | CO2 Sensor | Temp. Sensor | Humidity Sensor | Night Mode | Germ Shield |
|----------------------------------------------------------|:------------:|:-----------------:|:-----------:|:------------:|:-----------:|:-----------:|:----------:|:------------:|:---------------:|:----------:|:-----------:|
| Classic (280i, 290i, 380i, 480i, 490i, 580i, 680i, 690i) |      Y       |         Y         |      N      |      Y       |      N      |      Y      |     Y      |      Y       |        Y        |     N      |      N      |
| Classic (205, 405, 505, 605)                             |      Y       |         Y         |      N      |      N       |      N      |      N      |     N      |      N       |        N        |     N      |      N      |
| Aware                                                    |      Y       |         Y         |      N      |      Y       |      Y      |      Y      |     Y      |      Y       |        Y        |     N      |      N      |
| DustMagnet (5210, 5410)                                  |      Y       |         Y         |      N      |      Y       |      N      |      N      |     N      |      N       |        N        |     Y      |      N      |
| HealthProtect (7440i, 7470i, 7710i)                      |      Y       |         Y         | In Progress |      Y       | In Progress | In Progress |     N      |      Y       |        N        |     Y      |      Y      |
| Blue Pure (211i Max, 311i+ Max, 411i Max)                |      Y       |         Y         | In Progress |      Y       | In Progress |      N      |     N      |      N       |        N        |     Y      |      N      |

**Note**: For all newer Blueair devices that leverage AWS infrastructure (i.e. DustMagnet, HealthProtect, and Blue Pure), the only current regions supported are US and Canada/EU. Please open a new issue if you need a new region configured.

### To do

- Continue to add support for additional models. Match capabilities to Homekit device. See Issue #6.

## Plugin Configuration
### Feature Toggles
* Enable AWS-enabled devices (This is required for devices like DustMagnet, HealthProtect, and Blue Pure.)
* Hide LED
* Hide Air Quality Sensor
* Hide Temperature Sensor
* Hide Humidity Sensor
* Hide CO2 Sensor
* Hide Night Mode
* Hide Germ Shield

If you choose to configure this plugin directly instead of using the [Homebridge Configuration web UI](https://github.com/oznu/homebridge-config-ui-x), you'll need to add the platform to your `config.json` in your home directory inside `.homebridge`.

```js
"platforms": [{
    "platform": "BlueAir",
    "username": "email@email.com",
    "password": "password"
}]
```

For most people, I recommend using [Homebridge Configuration web UI](https://github.com/oznu/homebridge-config-ui-x) to configure this plugin rather than doing so directly. It's easier to use for most users, especially newer users, and less prone to typos, leading to other problems.

## Credits
Many thanks to [@jonato1](https://github.com/jonato1) for his hard work developing the Amazon Web Services (AWS) API and associate accessories. 

This plug was forked from [homebridge-blueair](https://github.com/mylesagray/homebridge-blueair) without which this would not be possible. Many thanks to [@mylesagray](https://github.com/mylesagray)! This plugin uses many cues from [homebridge-myq2](https://github.com/hjdhjd/homebridge-myq2/) for plugin structure and my other plugin [homebridge-kumo](https://github.com/fjs21/homebridge-kumo).
