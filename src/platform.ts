import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { BlueAirApi } from './blueair-api';
import { BlueAirAwsApi } from './blueair-aws-api';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import { BlueAirPlatformAccessory } from './platformAccessory';
import { BlueAirClassicAccessory } from './platformAccessory_Classic';
import { BlueAirAwareAccessory } from './platformAccessory_Aware';
import { BlueAirDustProtectAccessory } from './platformAccessory_DustProtect';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class BlueAirHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  readonly blueair!: BlueAirApi;
  readonly blueairAws!: BlueAirAwsApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // initializing login information
    this.log = log;

    if(config.username === undefined || config.password === undefined){
      this.log.error('Missing BlueAir API credentials.');
      return;
    }

    this.blueair = new BlueAirApi(this.log, config.username, config.password);
    if(this.config.enableAWS) {
      this.blueairAws = new BlueAirAwsApi(this.log, config.username, config.password, config.region);
    }

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();

      // retrieve AWS devices - testing/work by @jonato1
      if(this.config.enableAWS) {
        this.discoverAwsDevices();
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  
  async discoverDevices() {
    
    // get homehost
    const flag: boolean = await this.blueair.getHomehost();
    if(!flag){
      this.log.error('Failed to retrieve homehost. Be sure username is set.');
      return false;
    }

    // login to BlueAir
    const login_flag: boolean = await this.blueair.login();
    if(!login_flag){
      this.log.error('Failed to login. Check password and restart Homebridge to try again.');
      return false;
    }

    // retrieve devices
    const devices_flag = await this.blueair.getDevices();
    if(!devices_flag){
      this.log.error('Failed to get list of devices. Check BlueAir App.');
      return false;
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.blueair.devices) { 

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.uuid);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        
        // Exclude or include certain openers based on configuration parameters.
        if(!this.optionEnabled(device)) {
          this.log.info('Removing accessory:', device.uuid);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          continue;
        }

        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        this.api.updatePlatformAccessories([existingAccessory]);

        await this.findModelAndInitialize(device, existingAccessory);        

      } else {
        // the accessory does not yet exist, so we need to create it

        // Exclude or include certain openers based on configuration parameters.
        if(!this.optionEnabled(device)) {
          this.log.info('Skipping accessory:', device.uuid);
          continue;
        }

        this.log.info('Adding new accessory:', device.name);
  
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        accessory.context.uuid = device.uuid;
        accessory.context.mac = device.mac;
        accessory.context.userid = device.userid;

        await this.findModelAndInitialize(device, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    // end for
    }

  }

  async discoverAwsDevices() {

    // login to BlueAir
    const login_flag: boolean = await this.blueairAws.awsLogin();
    if(!login_flag){
      this.log.error('Failed to login to AWS. Check password and restart Homebridge to try again.');
      return false;
    }

    // retrieve devices
    const devices_flag = await this.blueairAws.getAwsDevices();
    if(!devices_flag){
      this.log.error('Failed to get list of AWS devices. Check BlueAir App.');
      return false;
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.blueairAws.awsDevices) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.uuid);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists

        // Exclude or include certain openers based on configuration parameters.
        if(!this.optionEnabled(device)) {
          this.log.info('Removing accessory:', device.uuid);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          continue;
        }

        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        this.api.updatePlatformAccessories([existingAccessory]);

        await this.findAwsModelAndInitialize(device, existingAccessory);

      } else {
        // the accessory does not yet exist, so we need to create it

        // Exclude or include certain openers based on configuration parameters.
        if(!this.optionEnabled(device)) {
          this.log.info('Skipping accessory:', device.uuid);
          continue;
        }

        const deviceInfo = await this.blueairAws.getAwsDeviceInfo(device.name, device.uuid);
        //this.log.info('Device Info:', deviceInfo);

        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(deviceInfo[0].configuration.di.name, uuid); // may edit for consistentcy in future version

        accessory.context.deviceApiName = device.name; // may edit for consistency in future version
        accessory.context.uuid = device.uuid;
        accessory.context.mac = device.mac;
        // accessory.context.userid = device.userid;

        await this.findAwsModelAndInitialize(device, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      // end for
    }

  }

  // Modified from homebridge-myq
  // Utility function to let us know if a BlueAir device should be visible in HomeKit or not.
  private optionEnabled(device, defaultReturnValue = true): boolean {

    // There are a couple of ways to hide and show devices that we support. The rules of the road are:
    //
    // 1. Explicitly hiding, or showing a gateway device propogates to all the devices that are plugged
    //    into that gateway. So if you have multiple gateways but only want one exposed in this plugin,
    //    you may do so by hiding it.
    //
    // 2. Explicitly hiding, or showing an opener device by its serial number will always override the above.
    //    This means that it's possible to hide a gateway, and all the openers that are attached to it, and then
    //    override that behavior on a single opener device that it's connected to.
    //

    // Nothing configured - we show all Kumo devices to HomeKit.
    if(!this.config.options) {
      return defaultReturnValue;
    }

    // We've explicitly enabled this device.
    if(this.config.options.indexOf('Enable.' + device.uuid) !== -1) {
      return true;
    }

    // We've explicitly hidden this opener.
    if(this.config.options.indexOf('Disable.' + device.uuid) !== -1) {
      return false;
    }

    // If we don't have a zoneTable label, we're done here.
    if(!device.name) {
      return true;
    }

    // We've explicitly shown the zoneTabel label this device is attached to.
    if(this.config.options.indexOf('Enable.' + device.name) !== -1) {
      return true;
    }

    // We've explicitly hidden the zoneTable label this device is attached to.
    if(this.config.options.indexOf('Disable.' + device.name) !== -1) {
      return false;
    }

    // Nothing special to do - make this opener visible.
    return defaultReturnValue;
  }

  private async findModelAndInitialize(device, accessory){
    // retreive model info
    const info = await this.blueair.getDeviceInfo(device.uuid);
    this.log.info('%s of type "%s" initialized.', device.name, info.compatibility);

    switch (info.compatibility) {
      case 'classic_280i': 
      case 'classic_290i':
      case 'classic_380i':
      case 'classic_480i':
      case 'classic_490i':
      case 'classic_580i':
      case 'classic_680i':
      case 'classic_690i':
        new BlueAirPlatformAccessory(this, accessory, this.config);
        break;

      case 'aware': 
        new BlueAirAwareAccessory(this, accessory, this.config);
        break;

      case 'classic_205':
      case 'classic_405':
      case 'classic_505':
      case 'classic_605':
        new BlueAirClassicAccessory(this, accessory, this.config);
        break;
        
      case 'sense+':
        new BlueAirClassicAccessory(this, accessory, this.config);
        break;
      default:
        this.log.error('%s: device type not recognized, contact developer via GitHub.', device.name);
        this.log.error('%s: compatibility type not recognized.', info.compatibility);
    }

  }

  // AWS Accessory currently handles DustMagnet and Health Protect
  private async findAwsModelAndInitialize(device, accessory){
    // retrieve model info
    const info = await this.blueairAws.getAwsDeviceInfo(device.name, device.uuid);
    this.log.debug('Device Info from findAwsModelAndInitialize: ', info);
    //this.log.info('%s of type "%s" initialized.', device.configuration.di.name, info.compatibility);

    switch (info[0].configuration.di.hw) {
      case 'b4basic_s_1.1': // DustMagnet 5210
      case 'b4basic_m_1.1': // DustMagnet 5410
      case 'low_1.4': // HealthProtect 7440i, 7710i
      case 'high_1.5': // HealthProtect 7470i
      case 'nb_h_1.0': // Blue Pure 211i Max
      case 'nb_m_1.0': // Blue Pure 311i+ Max
      case 'nb_l_1.0': // Blue Pure 411i Max
        this.log.info('Creating new object: BlueAirDustProtectAccessory');
        new BlueAirDustProtectAccessory(this, accessory, this.config);
        break;
      default:
        this.log.error('%s: device type not recognized, contact developer via GitHub.', device.name);
        this.log.error('This device is not yet supported. Device Type: ', info[0].configuration.di.hw);
    }
  }

  public removeServiceIfExists(accessory, service) {
    this.log.debug('removeServiceIfExists accessory:', accessory);
    this.log.debug('removeServiceIfExists service:', service);
    const foundService = accessory.getService(service);
    this.log.debug('removeServiceIfExists foundServices:', foundService);
    if (foundService != null) {
      this.log.info(
        'Removing stale Service: uuid:[%s]',
        foundService.UUID,
      );

      accessory.removeService(foundService);
    } else if (service != null) {
      this.log.info(
        'Removing stale Service: uuid:[%s]',
        service.UUID,
      );

      accessory.removeService(service);
    }
  }

  public getServiceUsingName(accessory, serviceName: string) {
    this.log.debug('getServiceUsingName accessory:', accessory);
    this.log.debug('getServiceUsingName serviceName:', serviceName);
    const foundService = accessory.getService(serviceName);

    return foundService;
  }
}
