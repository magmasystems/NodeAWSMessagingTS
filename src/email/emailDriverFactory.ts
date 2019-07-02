import { IEmailDriver } from "./IEmailDriver";
import { SESEmailDriver } from "./sesEmailDriver";

export class EmailDriverFactory
{
    public static Create(driver = "ses"): IEmailDriver
    {
        switch (driver.toLowerCase())
        {
            case "ses":
            default:
                return new SESEmailDriver();
        }
    }
}
