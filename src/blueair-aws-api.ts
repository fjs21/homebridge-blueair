import { Logger } from 'homebridge';
import fetchTimeout from 'fetch-timeout';
import util from 'util';

import {
  BLUEAIR_AWS_APIKEYS,
  BLUEAIR_DEVICE_WAIT,
  BLUEAIR_LOGIN_WAIT,
} from './settings';

export class BlueAirAwsApi {

  awsDevices;

  private username: string;
  private password: string;
  private region: string;

  private lastAuthenticateCall!: number;

  // AWS URL Regions
  private gigyaRegion!: string;
  private awsRegion!: string;

  // AWS Keys
  private readonly awsKeys;
  private awsApiKey!: string;
  private awsRestApiId!: string;

  // AWS Session Variables
  private sessionToken!: string;
  private sessionSecret!: string;

  // AWS Tokens
  private jwtToken!: string;
  private accessToken!: string;
  private refreshToken!: string;
  private tokenExpiration!: number;

  // Old AWS Variable(s) - TODO: Confirm if can be deleted
  private authorization!: string;

  private log: Logger;

  // initiate instance with login information
  constructor(log: Logger, username: string, password: string, region: string) {
    this.log = log;

    if(username === undefined){
      throw new Error('BlueAir API: no username specified.');
    }

    if(password === undefined){
      throw new Error('BlueAir API: no password specified.');
    }
    this.username = username;
    this.password = password;
    this.region = region;
    this.awsKeys = BLUEAIR_AWS_APIKEYS;
    //this.devices = [];

    // Set AWS Regions to enable global interoperability
    // @TODO identify other AWS and Gigya regions
    // @TODO determine programatic way to identify region that doesn't rely on user having to maintain config
    this.setAwsRegions();
    if(this.gigyaRegion === undefined) {
      throw new Error('No region specified for Gigya API.');
    }
    if(this.awsRegion === undefined) {
      throw new Error('No region specified for AWS Execute API.');
    }
    if(this.awsRestApiId === undefined) {
      throw new Error('No REST API ID specified for AWS Execute API.');
    }
    if(this.awsApiKey === undefined) {
      throw new Error('No API Key specified for AWS Execute API.');
    }

    //this.base_API_url = 'https://api.blueair.io/v2/user/' + this.username + '/homehost/';
    //this.log.info('base_API_url: %s', this.base_API_url);
  }

  /* AWS Specific Methods */
  async setAwsRegions() {
    this.gigyaRegion = this.awsKeys[this.region]['gigyaRegion'];
    this.awsRegion = this.awsKeys[this.region]['awsRegion'];
    this.awsRestApiId = this.awsKeys[this.region]['restApiId'];
    this.awsApiKey = this.awsKeys[this.region]['apiKey'];

    this.log.info('Current Gigya Region: %s', this.gigyaRegion);
    this.log.info('Current AWS Region: %s', this.awsRegion);
    this.log.debug('Current AWS REST API ID: %s', this.awsRestApiId);
    this.log.debug('Current AWS API Key: %s', this.awsApiKey);

    return true;
  }

  // login AWS
  async awsLogin() {

    // Reset the API call time.
    const now = Date.now();
    this.lastAuthenticateCall = now;
    this.tokenExpiration = now + BLUEAIR_LOGIN_WAIT;
    const expirationDate = new Date(this.tokenExpiration);
    this.log.info('Blueair AWS API Tokens will expire at: %s', expirationDate.toString());

    const url = 'https://accounts.' + this.gigyaRegion + '.gigya.com/accounts.login';

    // details of form to be submitted
    const details = {
      'apikey': this.awsApiKey,
      'loginID': this.username,
      'password': this.password,
      'targetEnv': 'mobile',
    };

    // encode into URL
    const formBody: string[] = [];
    for (const property in details) {
      const encodedKey = encodeURIComponent(property);
      const encodedValue = encodeURIComponent(details[property]);
      formBody.push(encodedKey + '=' + encodedValue);
    }
    const formBody_joined: string = formBody.join('&');

    let response;
    try{
      response = await fetchTimeout(url, {
        method: 'POST',
        headers: {
          'Host': 'accounts.' + this.gigyaRegion + '.gigya.com',
          'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
          'Connection': 'keep-alive',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody_joined,
      }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
    } catch(error) {
      this.log.error('BlueAir AWS API: error - %s', error);
      return false;
    }

    const headers = await response.headers;
    const data = await response.json();

    this.sessionToken = data.sessionInfo.sessionToken;
    this.sessionSecret = data.sessionInfo.sessionSecret;

    // GET JWT Token

    const jwtUrl = 'https://accounts.' + this.gigyaRegion + '.gigya.com/accounts.getJWT';

    // details of form to be submitted
    const jwtDetails = {
      'oauth_token': this.sessionToken,
      'secret': this.sessionSecret,
      'targetEnv': 'mobile',
    };

    // encode into URL
    const jwtFormBody: string[] = [];
    for (const jwtProperty in jwtDetails) {
      const encodedKey = encodeURIComponent(jwtProperty);
      const encodedValue = encodeURIComponent(jwtDetails[jwtProperty]);
      jwtFormBody.push(encodedKey + '=' + encodedValue);
    }
    const jwtFormBody_joined: string = jwtFormBody.join('&');

    let jwtResponse;
    try{
      jwtResponse = await fetchTimeout(jwtUrl, {
        method: 'POST',
        headers: {
          'Host': 'accounts.' + this.gigyaRegion + '.gigya.com',
          'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
          'Connection': 'keep-alive',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: jwtFormBody_joined,
      }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
    } catch(error) {
      this.log.error('BlueAir AWS API: error - %s', error);
      return false;
    }

    const jwtHeaders = await jwtResponse.headers;
    const jwtData = await jwtResponse.json();

    this.jwtToken = jwtData.id_token;
    //this.authorization = data.UIDSignature;

    // Use JWT Token to get Access Token for Execute API endpoints

    const executeUrl = 'https://' + this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com/prod/c/login';

    let executeResponse;
    try{
      executeResponse = await fetchTimeout(executeUrl, {
        method: 'POST',
        headers: {
          'Host': this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com',
          'Connection': 'keep-alive',
          'idtoken': this.jwtToken,
          'Accept': '*/*',
          'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
          'Authorization': 'Bearer ' + this.jwtToken,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
    } catch(error) {
      this.log.error('BlueAir AWS API: error - %s', error);
      return false;
    }

    const executeHeaders = await executeResponse.headers;
    const executeData = await executeResponse.json();

    this.accessToken = executeData.access_token;

    this.log.debug('** AWS login begin **');
    this.log.debug('Headers:', headers);
    //this.log.info(util.inspect(data, { colors: true, sorted: true}));
    this.log.debug('JWT Headers:', jwtHeaders);
    //this.log.info(util.inspect(jwtData, { colors: true, sorted: true}));
    //this.log.info('AWS jwtToken: %s', this.jwtToken);
    this.log.debug('Execute Headers:', executeHeaders);
    //this.log.info(util.inspect(executeData, { colors: true, sorted: true}));
    //this.log.info('AWS accessToken: %s', this.accessToken);
    //this.log.info('AWS authorization: %s', this.authorization);
    this.log.debug('** AWS login end **');
    this.log.info('** AWS login complete **');

    return true;
  }

  async checkIfAwsTokensExpired() {
    // Check if the tokenExpiration is older than the current date.
    const now = Date.now();
    const expirationDate = new Date(this.tokenExpiration);
    this.log.debug('Checking token expiration date/time. Current token(s) expire at: %s', expirationDate.toString());

    if(this.tokenExpiration < now) {
      const refreshTokens = await this.refreshAwsTokens();
      return refreshTokens;
    } else {
      return false;
    }
  }

  async refreshAwsTokens() {
    this.log.info('Attempting to re-login and refresh Access and Refresh tokens for user account');
    const retryLogin = await this.awsLogin();
    this.log.debug('retryLogin result: %s', retryLogin);
    return true;
  }

  // get devices AWS - does not work
  async getAwsDevices() {
    await this.checkIfAwsTokensExpired();
    const url = 'https://' + this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com/prod/c/registered-devices';

    let response;
    try{
      response = await fetchTimeout(url, {
        method: 'GET',
        headers: {
          'Host': this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com',
          'Connection': 'keep-alive',
          'idtoken': this.accessToken,
          'Accept': '*/*',
          'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
          'Authorization': 'Bearer ' + this.accessToken,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
    } catch(error) {
      this.log.error('BlueAir AWS API: error - %s', error);
      return false;
    }

    let data;
    try{
      data = await response.json();
    } catch(error) {
      // if cannot parse response
      this.log.error('BlueAir AWS API: error parsing json. %s', data);
      return false;
    }

    this.awsDevices = data.devices;

    this.log.debug('** AWS devices - begin **');
    this.log.debug(util.inspect(data, { colors: true, sorted: true}));
    this.log.info('Found %s Blueair AWS-compatible devices.', this.awsDevices.length);
    this.log.debug('** AWS devices - end **');

    return true;
  }

  // get devices AWS - does not work
  async getAwsDeviceInfo(deviceName: string, deviceUuid: string) {
    await this.checkIfAwsTokensExpired();
    const url = 'https://' + this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com/prod/c/' + deviceName + '/r/initial';

    // details of form to be submitted
    const body = JSON.stringify({
      'deviceconfigquery': [
        {
          'id': deviceUuid,
          'r': {
            'r': [
              'sensors',
            ],
          },
        },
      ],
      'includestates': true,
      'eventsubscription': {
        'include': [
          {
            'filter': {
              'o': '= ' + deviceUuid,
            },
          },
        ],
      },
    });

    let response;
    try{
      response = await fetchTimeout(url, {
        method: 'POST',
        headers: {
          'Host': this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com',
          'Connection': 'keep-alive',
          'idtoken': this.accessToken,
          'Accept': '*/*',
          'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
          'Authorization': 'Bearer ' + this.accessToken,
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/json',
        },
        body: body,
      }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
    } catch(error) {
      this.log.error('BlueAir AWS API: error - %s', error);
      return false;
    }

    const responseHeaders = await response.headers;
    const responseBody = await response.json();

    this.log.debug('Response Headers for Initial Call: ', util.inspect(responseHeaders, { colors: true, sorted: true}));
    this.log.debug('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo, { colors: true, sorted: true}));
    this.log.debug('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0], { colors: true, sorted: true}));
    this.log.debug('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0].configuration.di.name, { colors: true, sorted: true}));
    this.log.debug('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0].sensordata, { colors: true, sorted: true}));
    this.log.debug('Response Body for Initial Call: ', util.inspect(responseBody.deviceInfo[0].states, { colors: true, sorted: true}));

    return responseBody.deviceInfo;
  }

  // function to send command to BlueAir API url using authentication
  async setAwsDeviceInfo(deviceUuid: string, service: string, actionVerb: string, actionValue): Promise<boolean> {
    await this.checkIfAwsTokensExpired();
    const url = 'https://' + this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com/prod/c/' + deviceUuid + '/a/' + service;

    // details of form to be submitted
    let body;

    if(actionVerb === 'vb') {
      body = JSON.stringify({
        'n': service,
        'vb': actionValue,
      });
    } else {
      body = JSON.stringify({
        'n': service,
        'v': actionValue,
      });
    }

    this.log.debug('Request Body: ', util.inspect(body, { colors: true, sorted: true }));

    let response;
    try{
      response = await fetchTimeout(url, {
        method: 'POST',
        headers: {
          'Host': this.awsRestApiId + '.execute-api.' + this.awsRegion + '.amazonaws.com',
          'Connection': 'keep-alive',
          'idtoken': this.accessToken,
          'Accept': '*/*',
          'User-Agent': 'Blueair/58 CFNetwork/1327.0.4 Darwin/21.2.0',
          'Authorization': 'Bearer ' + this.accessToken,
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/json',
        },
        body: body,
      }, BLUEAIR_DEVICE_WAIT, 'Time out on BlueAir AWS connection.');
    } catch(error) {
      this.log.error('BlueAir AWS API: error - %s', error);
      return false;
    }

    const responseHeaders = await response.headers;
    const responseBody = await response.json();

    if(response.status !== 200) {
      this.log.warn(util.inspect(response, { colors: true, sorted: true, depth: 6 }));
      return false;
    }

    this.log.info('Set %s to %s', service, actionValue);

    this.log.debug('Response Headers: ', util.inspect(responseHeaders, { colors: true, sorted: true }));
    this.log.debug('Response Body: ', util.inspect(responseBody, { colors: true, sorted: true }));

    return responseBody;

  }

}

