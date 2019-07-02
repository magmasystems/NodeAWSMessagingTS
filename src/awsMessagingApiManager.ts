//#region Imports
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { Router } from 'express';
import { AppContext } from './appContext';
import { AWSServiceClient } from './aws/awsServiceClient';
import { IAWSMessagingServerSettings } from './awsMessagingServerSettings';
import { AWSServiceEventPublisher } from './awsServiceEventPublisher';
import { ConfigurationManager } from './configurationManager';
import { IDisposable } from './framework/using';
import { TSLogger } from './logging/tslogger';
import { ServiceLoader } from './services/serviceLoader';
//#endregion

export class AWSMessagingApiManager implements IDisposable
{
  //#region Variables
  // Logging
  private Logger: any;

  // Event publisher
  private static eventPublisher: AWSServiceEventPublisher;
  private Config: any;
  public get EventPublisher(): AWSServiceEventPublisher { return AWSMessagingApiManager.eventPublisher; }

  // ExpressJS-related stuff
  private express: any;
  private router: Router;
  public get Express(): any { return this.express; }

  // A map of all AWS Service Clients
  public AWSServiceClientMap: Map<string, AWSServiceClient> = new Map<string, AWSServiceClient>();
  //#endregion

  //#region Constructors
  constructor(settings?: IAWSMessagingServerSettings)
  {
    this.Logger = new TSLogger().createLogger(`${this.constructor.name}`, []);
    AWSMessagingApiManager.eventPublisher = new AWSServiceEventPublisher("AWSMessagingRestApi");

    this.express = express();
    this.router = Router();

    // Create the services
    // Important - create the services before the Express.use() statements. This is mainly because the Passport-based
    // AuthService needs to set up its serialization callbacks before Express uses Passport.
    this.loadAllServices(settings);

    // Add some middleware to support CORS requests
    this.express
        .use((req, resp, next) =>
        {
            resp.header("Access-Control-Allow-Origin", "*");
            resp.header("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS");
            resp.header("Access-Control-Allow-Headers", "Access-Control-Allow-Origin, Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
            next();
        });

    this.express
        .use(bodyParser.json())                             // support json encoded bodies
        .use(bodyParser.urlencoded({ extended: true }))     // support encoded bodies
        .use(`${AppContext.RestApiPrefix}`, this.router);

    // Set up some common functionality in all services. Republishing their events and logging the resource changes.
    this.AWSServiceClientMap.forEach((service) =>
    {
        // Tell the service that the controlling API Manager is me.
        service.Manager = this;

        service.EventPublisher.on(`${AWSServiceEventPublisher.Prefix}**`, function(values: any[])
        {
            // Notice that we used the old-style Javascript function() above because we
            // want 'this' to refer to the event publisher and not to the AWSMessagingRestAPI class.
            //
            // The 'values' element is an Array[]. When we call emit() again, emit() will rewrap 'value'
            // into an Array[Array[]]. So, we need to deconstruct the values array before we call emit() again.
            AWSMessagingApiManager.eventPublisher.emit(this.event, values[0]);
        });

        service.ResourceInfoChanged = (client, newMap) =>
        {
            this.Logger.info(`${client.Name}: The resource map has changed`);
            AWSMessagingApiManager.eventPublisher.emit(`${AWSServiceEventPublisher.Prefix}Resource.Changed`, client.ServiceType, client.Name, newMap);
        };
    });

    this.initializeApis();
  }
  //#endregion

  //#region Cleanup
  public dispose(): void
  {
    this.AWSServiceClientMap.forEach((service) =>
    {
        service.dispose();
    });
    this.AWSServiceClientMap.clear();
  }
  //#endregion

  //#region Initialization
  private initializeApis(): void
  {
    // A simple call just to make sure that the server is up
    this.router.route(`/`).get((req, resp) =>
    {
      resp.json({ message: 'Welcome to NodeAWSMessaging' });
    });
    this.router.route(`${AppContext.RestApiPrefix}`).get((req, resp) =>
    {
      resp.json({ message: 'Welcome to NodeAWSMessaging' });
    });

    // Create the APIs for each service
    this.AWSServiceClientMap.forEach((service) =>
    {
        service.createApi(this.router);
    });
  }
  //#endregion

  //#region Services
  private loadAllServices(settings?: IAWSMessagingServerSettings): void
    {
      // Note: we should do this dynamically, through reflection
      if (!this.Config)
      {
          this.Config = new ConfigurationManager(settings).Configuration;
      }

      const listOfServices = this.Config.appSettings.services || [];
      const services = ServiceLoader.LoadAllServices("AWSServiceClient", listOfServices, this, settings);

      // Add the various services to the map
      // tslint:disable-next-line:forin
      for (const serviceName in services)
      {
          const service: AWSServiceClient = services[serviceName] as AWSServiceClient;
          this.AWSServiceClientMap.set(service.Name, service);
      }
    }

    public getService<TService extends AWSServiceClient>(name: string): TService
    {
      if (!this.AWSServiceClientMap.has(name)) {
          return null;
      }

      const service = this.AWSServiceClientMap.get(name);
      return service as TService;
    }
  //#endregion

  //#region Public Methods
  public findServiceByType(typeName: string): AWSServiceClient
  {
    this.AWSServiceClientMap.forEach((service) =>
    {
        if (typeof service === typeName)
        {
            return service;
        }
    });

    return null;
  }

  public findServiceByName(name: string): AWSServiceClient
  {
    return this.AWSServiceClientMap.get(name);
  }
  //#endregion
}
