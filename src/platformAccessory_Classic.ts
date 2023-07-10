import { Service, PlatformAccessory, PlatformConfig } from 'homebridge';

import fakegato from 'fakegato-history';

import { BlueAirHomebridgePlatform } from './platform';

import { BLUEAIR_DEVICE_WAIT } from './settings';

export class BlueAirClassicAccessory {
  // setup device services
  private AirPurifier: Service;
  private FilterMaintenance: Service;
  private Lightbulb!: Service;

  // store last query to BlueAir API
  private lastquery;

  // setup fake-gato history service for Eve support
  private historyService: fakegato.FakeGatoHistoryService;

  constructor(
    private readonly platform: BlueAirHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: PlatformConfig,
  ) {

    // set model name, firware, etc.
    this.setAccessoryInformation();

    // initiate services
    this.AirPurifier = this.accessory.getService(this.platform.Service.AirPurifier) || 
      this.accessory.addService(this.platform.Service.AirPurifier);
    this.FilterMaintenance = this.accessory.getService(this.platform.Service.FilterMaintenance) ||
      this.accessory.addService(this.platform.Service.FilterMaintenance);
    if (!config.hideLED) {
      this.Lightbulb = this.accessory.getService(this.platform.Service.Lightbulb) ||
        this.accessory.addService(this.platform.Service.Lightbulb);
    } else {
      this.platform.removeServiceIfExists(this.accessory, this.platform.Service.Lightbulb);
    }
    
    // create handlers for characteristics
    this.AirPurifier.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleAirPurifierActiveGet.bind(this))
      .onSet(this.handleAirPurifierActiveSet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(this.handleCurrentAirPurifierStateGet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onGet(this.handleTargetAirPurifierGet.bind(this))
      .onSet(this.handleTargetAirPurifierSet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .onGet(this.handleLockPhysicalControlsGet.bind(this))
      .onSet(this.handleLockPhysicalControlsSet.bind(this));

    this.AirPurifier.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.handleRotationSpeedGet.bind(this))
      .onSet(this.handleRotationSpeedSet.bind(this));

    this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .onGet(this.handleFilterChangeGet.bind(this));

    this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
      .onGet(this.handleFilterLifeLevelGet.bind(this));

    if (!config.hideLED) {
      this.Lightbulb.getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.handleOnGet.bind(this))
        .onSet(this.handleOnSet.bind(this));

      this.Lightbulb.getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(this.handleBrightnessGet.bind(this))
        .onSet(this.handleBrightnessSet.bind(this));
    }

  }

  async setAccessoryInformation() {
    // setup information for each accessory

    await this.updateDevice();

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BlueAir')
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.info.compatibility)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.uuid)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.info.firmware);

  }
 
  async updateDevice() {
    // update accessory.context with latest values from BlueAir

    if ((Date.now() - BLUEAIR_DEVICE_WAIT) < this.lastquery) {
      //this.platform.log.debug('Recent update from device already performed.');
      if(!this.accessory.context.attributes) {
        this.platform.log.error('%s: accessory context not set', this.accessory.displayName);
        return false;
      }
      //this.platform.log.debug('%s: using old data', this.accessory.displayName);
      return true; //ok to use current data in context to update Characteristic values
    }
    this.lastquery = Date.now(); // update time of last query     

    try{
      const attributes = await this.platform.blueair.getDeviceAttributes(this.accessory.context.uuid);
      if(!attributes){
        this.platform.log.error('%s: getDeviceAttributes failed.', this.accessory.displayName);
        return false;
      }
      this.accessory.context.attributes = attributes;
    } catch(error) {
      this.platform.log.error('%s: getDeviceAttributes error. %s', this.accessory.displayName, error);
      return false;
    }

    try{
      const info = await this.platform.blueair.getDeviceInfo(this.accessory.context.uuid);
      if(!info){
        this.platform.log.error('%s: getDeviceInfo failed.', this.accessory.displayName);
        return false;
      }
      this.accessory.context.info = info;
    } catch(error) {
      this.platform.log.error('%s: getDeviceInfo error. %s', this.accessory.displayName, error);
      return false;
    }    

    const filterusageindays = Math.round(((this.accessory.context.info.initUsagePeriod/60)/60)/24);
    const filterlifeleft = (180 - filterusageindays);
    this.accessory.context.info.filterlevel = 100 * (filterlifeleft / 180);
    //this.platform.log.info('%s: Filter life left %s', this.accessory.displayName, this.accessory.context.info.filterlevel);

    return true;
  }

  // handlers GET

  async handleAirPurifierActiveGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.Active).value;
  }

  async handleCurrentAirPurifierStateGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState).value;
  }

  async handleTargetAirPurifierGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState).value;
  }

  async handleLockPhysicalControlsGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.LockPhysicalControls).value;
  }

  async handleRotationSpeedGet() {
    await this.updateAccessoryCharacteristics();
    return this.AirPurifier.getCharacteristic(this.platform.Characteristic.RotationSpeed).value;
  }

  async handleFilterChangeGet() {
    await this.updateAccessoryCharacteristics();
    return this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterChangeIndication).value;
  }

  async handleFilterLifeLevelGet() {
    await this.updateAccessoryCharacteristics();
    return this.FilterMaintenance.getCharacteristic(this.platform.Characteristic.FilterLifeLevel).value;
  }

  async handleOnGet() {
    await this.updateAccessoryCharacteristics();
    return this.Lightbulb.getCharacteristic(this.platform.Characteristic.On).value;
  }

  async handleBrightnessGet() {
    await this.updateAccessoryCharacteristics();
    return this.Lightbulb.getCharacteristic(this.platform.Characteristic.Brightness).value;
  }
 
  // common function to update all characteristics
  async updateAccessoryCharacteristics() {
    // updateAccessoryCharacteristics

    // update context.device information from Kumo or Directly
    const status: boolean = await this.updateDevice();
    if(!status) { 
      this.platform.log.info('updateAccessoryCharacteristic failed (%s)', this.accessory.context.uuid);
      return false;
    }

    // update characteristics from this.accessory.context
    this.updateAirPurifierActiveState();
    this.updateAirPurifierCurrentAirPurifierState();
    this.updateAirPurifierTargetAirPurifierState();
    this.updateAirPurifierLockPhysicalControl();
    this.updateAirPurifierRotationSpeed();
    this.updateLED();

    return true;
  }

  async updateAirPurifierActiveState() {
    // AirPurifier Active

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.Active).value;
    
    if(this.accessory.context.attributes.fan_speed === '0'){
      currentValue = this.platform.Characteristic.Active.INACTIVE;
    } else if (this.accessory.context.attributes.fan_speed >= 1 && this.accessory.context.attributes.fan_speed <=3) {
      currentValue = this.platform.Characteristic.Active.ACTIVE;
    } else if (this.accessory.context.attributes.mode === 'auto') {
      currentValue = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.platform.log.error('%s: failed to determine active state.', this.accessory.displayName);
      return false;
    }

    this.platform.log.debug('%s: Active is %s', this.accessory.displayName, currentValue);
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.Active, currentValue);
    return true;
  }

  async updateAirPurifierCurrentAirPurifierState() {
    // AirPurifier Current State

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState).value;
    
    if(this.accessory.context.attributes.fan_speed > 0){
      currentValue = this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    } else {
      currentValue = this.platform.Characteristic.CurrentAirPurifierState.INACTIVE;
    }

    this.platform.log.debug('%s: CurrentState is %s', this.accessory.displayName, currentValue);
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, currentValue);
    return true;
  }

  async updateAirPurifierTargetAirPurifierState() {
    // AirPurifier Target State

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState).value;
    
    if(this.accessory.context.attributes.mode === 'auto'){
      currentValue = this.platform.Characteristic.TargetAirPurifierState.AUTO;
    } else if (this.accessory.context.attributes.mode === 'manual'){
      currentValue = this.platform.Characteristic.TargetAirPurifierState.MANUAL;
    }

    this.platform.log.debug('%s: TargetState is %s', this.accessory.displayName, currentValue); 
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, currentValue);
    return true;
  }

  async updateAirPurifierLockPhysicalControl() {
    // AirPurifier Physical Control

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.LockPhysicalControls).value;
    
    if(this.accessory.context.attributes.child_lock === '0'){
      currentValue = this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
    } else {
      currentValue = this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
    }

    this.platform.log.debug('%s: LockPhysicalControl is %s', this.accessory.displayName, currentValue); 
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.LockPhysicalControls, currentValue);
    return true;
  }

  async updateAirPurifierRotationSpeed() {
    // AirPurifier Rotation Speed

    const fan_speed: number = this.accessory.context.attributes.fan_speed;

    let currentValue: number = <number>this.AirPurifier.getCharacteristic(this.platform.Characteristic.RotationSpeed).value;
    if (fan_speed !== undefined) {
      currentValue = (fan_speed * 33) + 1;  
    } else {
      // rotation speed not reported from device
      return false;
    }

    this.platform.log.debug('%s: RotationsSpeed is %s', this.accessory.displayName, currentValue); 
    this.AirPurifier.updateCharacteristic(this.platform.Characteristic.RotationSpeed, currentValue);
    return true;
  }

  async updateFilterMaintenance() {
    // Update Filter maintenance

    if(this.accessory.context.attributes.filter_status !== undefined) {
      let currentValue;
      if(this.accessory.context.attributes.filter_status === 'OK'){
        currentValue = this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
      } else {
        currentValue = this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER;
      }
      this.FilterMaintenance.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, currentValue);
    } else {
      this.platform.log.error('%s: no filter_status found.', this.accessory.displayName);
      return false;
    }

    if(this.accessory.context.info.filterlevel !== undefined) {
      if(this.accessory.context.info.filterlevel > 0) {
        this.FilterMaintenance.updateCharacteristic(this.platform.Characteristic.FilterLifeLevel, this.accessory.context.info.filterlevel);
      } else {
        this.FilterMaintenance.updateCharacteristic(this.platform.Characteristic.FilterLifeLevel, 0);
      }
    } else {
      this.platform.log.error('%s: no filterlife found.', this.accessory.displayName);
      return false;
    }

    return true;
  }

  async updateLED() {
    // get LED state & brigtness

    if(this.accessory.context.attributes.brightness !== undefined) {
      if(this.accessory.context.attributes.brightness > 0) {
        this.Lightbulb.updateCharacteristic(this.platform.Characteristic.On, 1);  
      } else {
        this.Lightbulb.updateCharacteristic(this.platform.Characteristic.On, 0);  
      }

      this.Lightbulb.updateCharacteristic(this.platform.Characteristic.Brightness, this.accessory.context.attributes.brightness);
    }
  }

  // handlers SET

  async handleAirPurifierActiveSet(state) {
    // Set AirPurifier state

    if (state === 1) {
      // Set fan to auto when turned on
      const url_end: string = this.accessory.context.uuid + '/attribute/mode/';
      await this.platform.blueair.sendCommand(url_end, 'auto', 'mode', this.accessory.context.uuid);      

    } else if (state === 0) {
      // Set fan speed to 0 when turned off
      const url_end: string = this.accessory.context.uuid + '/attribute/fanspeed/';
      await this.platform.blueair.sendCommand(url_end, '0', 'fan_speed', this.accessory.context.uuid);
    }
  }

  async handleTargetAirPurifierSet(state) {
    // Set fan to auto turned on without a speed set

    let targetPurifierState = '';
    if(state === 0){
      targetPurifierState = 'manual';
    } else if (state === 1){
      targetPurifierState = 'auto';
    }

    const url_end: string = this.accessory.context.uuid + '/attribute/mode/';
    await this.platform.blueair.sendCommand(url_end, targetPurifierState, 'mode', this.accessory.context.uuid);
  }

  async handleLockPhysicalControlsSet(state) {
    // Set child lock state

    const url_end: string = this.accessory.context.uuid + '/attribute/child_lock/';
    await this.platform.blueair.sendCommand(url_end, state, 'child_lock', this.accessory.context.uuid);
  }

  async handleRotationSpeedSet(value) {
    // Set fan rotation speed  
    const levels = [
      [67, 100, 3],
      [34, 66, 2],
      [1, 33, 1],
      [0, 0, 0],
    ];

    //Set fan speed based on percentage passed
    let fan_speed = ''; 
    for(const item of levels){
      if(value >= item[0] && value<= item[1]){
        fan_speed = item[2].toString();
      }
    }
    this.platform.log.info('%s: fan value: %s, fan_speed: %s', this.accessory.displayName, value, fan_speed);

    const url_end: string = this.accessory.context.uuid + '/attribute/fanspeed/';
    await this.platform.blueair.sendCommand(url_end, fan_speed, 'fan_speed', this.accessory.context.uuid);
    this.accessory.context.attributes.fan_speed = fan_speed;
  }

  async handleOnSet(state) {
    // Set LightBulb on

    let brightness;
    if(state === true) {
      if(this.accessory.context.attributes.brightness !== '0'){
        brightness = this.accessory.context.attributes.brightness;
      } else {
        brightness = 100;
      }
    } else if (state === false) {
      brightness = 0;
    }

    const url_end: string = this.accessory.context.uuid + '/attribute/brightness/';
    await this.platform.blueair.sendCommand(url_end, brightness.toString(), 'brightness', this.accessory.context.uuid);
  }

  async handleBrightnessSet(value) {
    // Set LightBulb brightness

    const brightness = Math.floor(value / 25) * 25;

    
    const url_end: string = this.accessory.context.uuid + '/attribute/brightness/';
    await this.platform.blueair.sendCommand(url_end, brightness.toString(), 'brightness', this.accessory.context.uuid);    
    this.Lightbulb.updateCharacteristic(this.platform.Characteristic.Brightness, this.accessory.context.attributes.brightness);
    this.platform.log.info('%s: LED brightness: %s, set to %s', this.accessory.displayName, value, brightness);
  }

}


