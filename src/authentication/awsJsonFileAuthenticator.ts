import * as AWS from 'aws-sdk';
import { AWSConfigurationManager } from '../awsConfigurationManager';
import { IAuthenticator } from './IAuthenticator';

/**
 * AWSJsonFileAuthenticator
 *   This authenticates an app using a Json credentials file.
 *
 * @export
 * @class AWSJsonFileAuthenticator
 * @implements {IAuthenticator}
 */
export class AWSJsonFileAuthenticator implements IAuthenticator
{
  private ProfileName: string = 'default';

  constructor(config: any = null)
  {
    const configObj = config || new AWSConfigurationManager().Configuration;
    this.ProfileName  = configObj.appSettings.authentication.iniProfile || 'default';
  }

  public authenticate(): boolean
  {
    const sharedCredentials = AWS.config.loadFromPath(this.ProfileName);
    return true;
  }
}
