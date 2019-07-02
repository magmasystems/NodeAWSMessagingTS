import { ConfigurationManager } from "../configurationManager";

export interface ISendEmailRequest
{
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
}

export class SendEmailRequest implements ISendEmailRequest
{
    public from: string;
    public to: string[];
    public cc?: string[];
    public bcc?: string[];
    public subject: string;
    public message: string;

    private static EmailConfig: any;

    constructor(body: any, transformationCallback?: (ISendEmailRequest) => ISendEmailRequest)
    {
        if (!SendEmailRequest.EmailConfig)
        {
            SendEmailRequest.EmailConfig = new ConfigurationManager().Configuration.appSettings.email;
        }

        this.from    = body.from || SendEmailRequest.EmailConfig.defaultSender || "storybuilder@story2.com";
        this.to      = body.to;
        this.cc      = body.cc;
        this.bcc     = body.bcc;
        this.subject = body.subject;
        this.message = body.message;

        // Maybe apply some transformation to the message and subject
        if (transformationCallback)
        {
            transformationCallback(this);
        }
    }
}
