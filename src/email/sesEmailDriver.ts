import { SESClient } from "../aws/sesClient";
import { IAWSMessagingServerSettings } from "../awsMessagingServerSettings";
import { TSLogger } from "../logging/tslogger";
import { ServiceCreationArgs } from "../services/serviceCreationArgs";
import { IEmailDriver } from "./IEmailDriver";
import { ISendEmailRequest } from "./sendEmailRequest";

export class SESEmailDriver implements IEmailDriver
{
    private SESClient: SESClient;
    private Logger: any;

    constructor(settings?: IAWSMessagingServerSettings)
    {
        this.Logger = new TSLogger().createLogger("SESEmailDriver", []);

        const serviceCreationArgs: ServiceCreationArgs = { Settings: settings, ServiceType: 'AWS', Name: 'SES' };
        this.SESClient = new SESClient(serviceCreationArgs);
    }

    public send(request: ISendEmailRequest): Promise<string>
    {
        this.Logger.info(`Got a SendEmail request for the service`);

        return new Promise<string>((resolve, reject) =>
        {
            this.SESClient.sendEmail(request)
                .then((messageId) =>
                {
                    resolve(messageId);
                })
                .catch((err) =>
                {
                    reject(err);
                });
        });
    }
}
