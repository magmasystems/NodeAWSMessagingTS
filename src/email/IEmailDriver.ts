import { ISendEmailRequest } from "./sendEmailRequest";

export interface IEmailDriver
{
    send(request: ISendEmailRequest): Promise<string>;
}
