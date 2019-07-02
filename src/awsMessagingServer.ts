import { AppContext } from "./appContext";
import { CloudwatchClient } from "./aws/cloudwatchClient";
import { SNSClient } from "./aws/snsClient";
import { SQSClient } from "./aws/sqsClient";
import { AWSMessagingApiManager } from "./awsMessagingApiManager";
import { AWSMessagingServerSettings, IAWSMessagingServerSettings } from "./awsMessagingServerSettings";
import { AWSServiceEventPublisher } from "./awsServiceEventPublisher";
import { ConfigurationManager } from "./configurationManager";
import { IDisposable } from "./framework/using";

export class AWSMessagingServer implements IDisposable
{
    private apiManager: AWSMessagingApiManager;
    private settings?: IAWSMessagingServerSettings;
    private userName: string;
    public Configuration: any;

    // Shortcuts for things thst the ApiManasger has
    public get SQSClient(): SQSClient { return this.ApiManager.getService<SQSClient>('SQS'); }
    public get SNSClient(): SNSClient { return this.ApiManager.getService<SNSClient>('SNS'); }
    public get CloudwatchClient(): CloudwatchClient { return this.ApiManager.getService<CloudwatchClient>('CloudWatch'); }
    public get AWSEvents(): AWSServiceEventPublisher { return this.ApiManager.EventPublisher; }

    public get App(): any { return this.ApiManager.Express; }
    public get ApiManager(): AWSMessagingApiManager { return this.apiManager; }
    public get AppContext(): AppContext { return AppContext; }
    public get UserName(): string { return this.userName; }
    public get Settings(): IAWSMessagingServerSettings { return this.settings; }
    public get Environment(): string { return this.Settings.Environment || undefined; }

    constructor(settings?: IAWSMessagingServerSettings)
    {
        this.Configuration = new ConfigurationManager(settings).Configuration;
        this.settings = settings;
        this.apiManager = new AWSMessagingApiManager(settings);
        this.userName = this.Configuration.appSettings.authentication.username || 'UnknownUser';
    }

    public dispose(): void
    {
        this.ApiManager.dispose();
    }
}
