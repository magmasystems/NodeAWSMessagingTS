// import * as AWS from 'aws-sdk';
// import { SQS } from 'aws-sdk';
// import { IDisposable } from './using';
'use strict';

import * as AWS from 'aws-sdk';
import * as proxy from 'proxy-agent';
import { AWSAuthenticatorFactory } from '../authentication/awsAuthenticatorFactory';
import { AWSConfigurationManager } from '../awsConfigurationManager';
import { AWSMessagingServerSettings, IAWSMessagingServerSettings } from '../awsMessagingServerSettings';
import { IDisposable, using } from '../using';

export class SBSAWSClient implements IDisposable
{
    public Name: string;
    public Configuration: any;
    private IsAuthenticated = false;

    constructor(name: string = 'AWS Client', settings?: IAWSMessagingServerSettings)
    {
        this.Configuration = new AWSConfigurationManager(settings).Configuration;
        this.Name = name;

        // Do some AWS config changes
        AWS.config.update({ region: this.Configuration.sqs.region });
        if (this.Configuration.appSettings.proxy && !this.Configuration.appSettings.proxyIgnore)
        {
            // ADLER - not yet
            // AWS.config.update({httpOptions: { agent: proxy(this.Configuration.appSettings.proxy) }});
        }

        // Authenticate us with AWS
        if (!this.IsAuthenticated)
        {
            this.IsAuthenticated = this.authenticate(this.Configuration);
        }
    }

    private authenticate(config: any = null): boolean
    {
        const configObj = config || this.Configuration;
        const authenticationMethod = configObj.appSettings.authentication.method || "ini";
        const authenticator = AWSAuthenticatorFactory.create(authenticationMethod, config);
        if (authenticator.authenticate() === false)
        {
            throw new Error(`Cannot authenticate the application using the current credentials`);
        }

        return true;
    }

    public dispose(): void
    {
    }
}
