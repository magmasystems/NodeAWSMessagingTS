import { AWSMessagingApiManager } from "./awsMessagingApiManager";

export interface IAWSMessagingServerSettings
{
    /**
     * Environment - optional environment string (dev, prod, qa).
     * This is used by the Configuration Manager to find the proper config file to use.
     *
     * @type {string}
     * @memberof IAWSMessagingServerSettings
     */
    Environment?: string;

    /**
     * ApiManager - the ApiManager that spawned off the AWS Services
     *
     * @type {AWSMessagingApiManager}
     * @memberof IAWSMessagingServerSettings
     */
    ApiManager?: AWSMessagingApiManager;

    /**
     * Configuration - we can pass in the Json of a config
     *
     * @type {*}
     * @memberof IAWSMessagingServerSettings
     */
    Configuration?: any;
}

export class AWSMessagingServerSettings implements IAWSMessagingServerSettings
{

    public Environment?: string;
    public ApiManager?: AWSMessagingApiManager;
    public Configuration?: any;

    constructor(env?: string)
    {
        if (env)
        {
            this.Environment = env;
        }
    }
}
