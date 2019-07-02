import { AWSMessagingApiManager } from "../awsMessagingApiManager";
import { IAWSMessagingServerSettings } from "../awsMessagingServerSettings";

export interface IServiceCreationArgs
{
    ServiceType?: string;
    Name?: string;
    ApiManager?: AWSMessagingApiManager;
    Settings?: IAWSMessagingServerSettings;
    Attrs?: any;
}

export class ServiceCreationArgs implements IServiceCreationArgs
{
    public ServiceType?: string = "AWS";
    public Name?: string;
    public ApiManager?: AWSMessagingApiManager;
    public Settings?: IAWSMessagingServerSettings;
    public Attrs?: any;
}
