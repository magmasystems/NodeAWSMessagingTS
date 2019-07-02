import * as services from '../../index';
import { AWSMessagingApiManager } from "../awsMessagingApiManager";
import { IAWSMessagingServerSettings } from "../awsMessagingServerSettings";
import { IServiceCreationArgs } from './serviceCreationArgs';

export class ReflectionHelpers
{
    public static getSubclassesOf(baseclassName: string): any[]
    {
        const classes = [];

        // tslint:disable-next-line:forin
        for (const element in module.exports)
        {
            const m = module.exports[element];
            if (m.prototype.constructor.name === baseclassName)
            {
                continue;
            }

            let rootName;
            for (let p = m.__proto__;  p.name;  p = p.__proto__)
            {
                rootName = p.name;
            }

            if (rootName === baseclassName)
            {
                classes.push(m);
            }
        }

        return classes;
    }
}

export class ServiceLoader
{
    public static LoadAllServices(baseClassName: string, classNamesToLoad?: string[], apiManager?: AWSMessagingApiManager, settings?: IAWSMessagingServerSettings): {}
    {
        const dict = {};
        const subclasses = ReflectionHelpers.getSubclassesOf(baseClassName);
        subclasses.map((classService) =>
        {
            const service = new classService();
            dict[service.Name] = service;
        });

        if (classNamesToLoad)
        {
            classNamesToLoad.map((name) =>
            {
                try
                {
                const args: IServiceCreationArgs = { ServiceType: "AWS", Name: name, ApiManager: apiManager, Settings: settings };
                const service = new (services as any)[name](args);
                dict[service.Name] = service;
                }
                catch (exc)
                {
                    console.error(exc);
                }
            });
        }

        return dict;
    }
}
