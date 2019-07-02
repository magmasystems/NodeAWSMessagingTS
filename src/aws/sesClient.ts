import { SES } from "aws-sdk";
import { SendEmailRequest } from "aws-sdk/clients/ses";
import express = require("express");
import { AppContext } from "../appContext";
import { ISendEmailRequest } from "../email/sendEmailRequest";
import { IServiceCreationArgs } from "../services/serviceCreationArgs";
import { AWSServiceClient } from "./awsServiceClient";

export class SESClient extends AWSServiceClient
{
    private InternalClient: SES;
    private NoSend: boolean;

    constructor(args: IServiceCreationArgs)
    {
        args.Name = 'SES';
        super(args);

        this.InternalClient = this.createClient();
        this.NoSend = AppContext.Configuration.appSettings.email.noSend || false;
    }

    private createClient(): SES
    {
        return new SES({ region: this.AWSClient.Configuration.ses.region, apiVersion: '2012-11-05' });
    }

    private sleep(ms): Promise<number>
    {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    public getServiceConfiguration(): any
    {
        return super.getServiceConfiguration().ses;
    }

    private deleteClient(): void
    {
        // There doesn't seem to be a dispose() function for the SES class
    }

    public createApi(router: express.Router): void
    {
        super.createApi(router);

        // let entity = this.getEntityName();
        // router.route(`/${entity}/customers`).get((req, resp)     => this.getAllCustomers(req, resp));
    }

    public getAllInfo(): Promise<{}>
    {
        return new Promise((resolve, _) => resolve());
    }

    public async sendEmail(request: ISendEmailRequest): Promise<string>
    {
        const sesRequest: SendEmailRequest =
        {
            Destination:
            {
                BccAddresses: request.bcc,
                CcAddresses: request.cc,
                ToAddresses: request.to,
            },
            Message:
            {
                Body:
                {
                    Html: { Charset: "UTF-8", Data: request.message },
                    Text: { Charset: "UTF-8", Data: request.message },
                },
                Subject: { Charset: "UTF-8", Data: request.subject },
            },
            ReplyToAddresses: [ request.from ],
            Source: request.from,
        };

        return new Promise<string>((resolve, reject) =>
        {
            if (this.NoSend)
            {
                this.Logger.info(`SESClient: emailing a message to ${request.to} but NOSEND is true`);
                resolve("0000-666-0000");
                return;
            }

            this.InternalClient.sendEmail(sesRequest, (err, data) =>
            {
                if (err)
                {
                    this.Logger.warn(`SESClient: emailing a message to ${request.to} and failed with error ${err.message}`);
                    reject(err);
                }
                else
                {
                    this.Logger.info(`SESClient: emailing a message to ${request.to} and succeeded with id ${data.MessageId}`);
                    resolve(data.MessageId);
                }
            });
        });
    }
}
