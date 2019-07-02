import * as fs from 'fs';
import { AppContext } from './appContext';
import { AWSMessagingServerSettings, IAWSMessagingServerSettings } from './awsMessagingServerSettings';

/**
 * AWSConfigurationManager
 *
 * @export
 * @class AWSConfigurationManager
 */
export class AWSConfigurationManager
{
    /**
     * Configuration
     *
     * @type {*}
     * @memberof AWSConfigurationManager
     */
    public Configuration: any;

    constructor(settings?: IAWSMessagingServerSettings, configFileName?: string)
    {
        const env: string = settings && settings.Environment ? settings.Environment : AppContext.Env;
        configFileName = configFileName || './app.config.{env}json';
        configFileName = configFileName.replace('{env}', env ? `${env}.` : '');

        let jsonConfig;

        if (settings && settings.Configuration)
        {
            // The actual Json config was passed into the settings.
            jsonConfig = settings.Configuration;
        }
        else
        {
            try
            {
                // Try to read the environment-specific config file first
                jsonConfig = fs.readFileSync(configFileName, 'utf8');
            }
            catch
            {
                // If the env-specific config file doesn't exist, try to read the general config file
                jsonConfig = fs.readFileSync('./app.config.json', 'utf8');
            }
        }

        // If there is no config file, then an exception will be thrown
        this.Configuration = JSON.parse(jsonConfig);
    }
}
