import { AWSIniFileAuthenticator } from "./awsIniFileAuthenticator";
import { AWSJsonFileAuthenticator } from "./awsJsonFileAuthenticator";
import { IAuthenticator } from "./IAuthenticator";

export class AWSAuthenticatorFactory
{
  public static create(driver: string, config: any = null, ...params): IAuthenticator
  {
    if (!driver)
    {
      driver = "ini";
    }

    switch (driver.toLowerCase())
    {
      case "ini":
      case "inifile":
        if (params.length > 0)
        {
          return new AWSIniFileAuthenticator(config);
        }
        else
        {
          return new AWSIniFileAuthenticator(config);
        }

      case "file":
      if (params.length > 0)
      {
        return new AWSJsonFileAuthenticator(config);
      }
      else
      {
        return new AWSJsonFileAuthenticator(config);
      }

      default:
        return new AWSIniFileAuthenticator(config);
    }
  }
}
