import { IAWSMessagingServerSettings } from "./awsMessagingServerSettings";

export class AppContext
{
    public static IsMocking: boolean;

    private static appName: string = 'node-aws-messaging';

    public static RestApiPrefix: string    = `/${AppContext.appName}`;
    public static RestSQSApiPrefix: string = `/awsmessaging/sqs`;
    public static RestSNSApiPrefix: string = `/awsmessaging/sns`;
    public static RestQueueApiPrefix: string = `/awsmessaging/queue`;
    public static RestTopicApiPrefix: string = `/awsmessaging/topic`;

    public static Env: string;
    public static Configuration: any;

    public static HttpServer: any;
}
