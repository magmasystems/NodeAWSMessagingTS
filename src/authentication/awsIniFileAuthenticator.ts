import * as AWS from 'aws-sdk';
import { AWSConfigurationManager } from '../awsConfigurationManager';
import { IAuthenticator } from './IAuthenticator';

/**
 * AWSIniFileAuthenticator
 *   This authenticates an app using a shared credentials file.
 *
 * @export
 * @class AWSIniFileAuthenticator
 * @implements {IAuthenticator}
 */
export class AWSIniFileAuthenticator implements IAuthenticator
{
  private ProfileName: string = 'default';

  constructor(config: any = null)
  {
    const configObj = config || new AWSConfigurationManager().Configuration;
    this.ProfileName  = configObj.appSettings.authentication.iniProfile || 'default';
  }

  public authenticate(): boolean
  {
    const sharedCredentials = new AWS.SharedIniFileCredentials({ profile: this.ProfileName });
    return true;
  }
}
