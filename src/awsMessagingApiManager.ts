//#region Imports
import * as bodyParser from 'body-parser';
import { EventEmitter2 } from 'eventemitter2';
import * as express from 'express';
import { Router } from 'express';
import * as http from 'http';
import { AppContext } from './appContext';
import { AWSServiceClient } from './aws/awsServiceClient';
import { CloudwatchAlarmInfo, CloudwatchClient } from './aws/cloudwatchClient';
import { SNSClient, SNSTopicInfo } from './aws/snsClient';
import { SQSClient, SQSQueueInfo } from './aws/sqsClient';
import { AWSMessagingServerSettings, IAWSMessagingServerSettings } from './awsMessagingServerSettings';
import { AWSServiceEventPublisher } from './awsServiceEventPublisher';
import { ConfigurationManager } from './configurationManager';
import { TSLogger } from './logging/tslogger';
import { ServiceLoader } from './services/serviceLoader';
import { IDisposable } from './using';
import { ServiceCreationArgs } from './services/serviceCreationArgs';
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

  // AWS Service Interfaces
  private sqsClient: SQSClient;
  public get SQSClient(): SQSClient { return this.sqsClient; }

  private snsClient: SNSClient;
  public get SNSClient(): SNSClient { return this.snsClient; }

  private cloudwatchClient: CloudwatchClient;
  public get CloudwatchClient(): CloudwatchClient { return this.cloudwatchClient; }
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

    /*
    this.sqsClient = new SQSClient(undefined, undefined, settings);
    this.snsClient = new SNSClient(undefined, undefined, settings);
    this.cloudwatchClient = new CloudwatchClient(undefined, undefined, settings);

    // Add the various services to the map
    this.AWSServiceClientMap.set(this.snsClient.Name, this.snsClient);
    this.AWSServiceClientMap.set(this.sqsClient.Name, this.sqsClient);
    this.AWSServiceClientMap.set(this.cloudwatchClient.Name, this.cloudwatchClient);
    */

    // Set up some common functionality in all services. Republishing their events and logging the resource changes.
    this.AWSServiceClientMap.forEach((service, name, map) =>
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
    this.AWSServiceClientMap.forEach((service, name, map) =>
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
      resp.json({ message: 'Welcome to SBS NodeAWSMessaging' });
    });

    this.createSQSRestAPIs();
    this.createSNSRestAPIs();
    this.createCloudwatchRestAPIs();
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

  //#region Create the APIs
  private createSQSRestAPIs(): void
  {
    // Create a Queue
    this.router.route(`/queue/create`).post((req, resp) =>
    {
      const queueName: string = req.body.Name;

      // Get the attributes
      const attrs = req.body || {};

      this.Logger.info(`Create Queue request received: Name ${queueName}`);

      this.SQSClient
        .createQueue(queueName, attrs)
        .then((queueInfo) =>
        {
            resp.status(201).json(queueInfo);
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    });

    // Maybe create a Queue and send a message
    this.router.route(`/queue/:queue/send/:body`).get((req, resp) =>
    {
        const retentionPeriod: number = req.params.messageRetentionPeriod || this.SQSClient.Config.sqs.messageRetentionPeriod || 90;

        this.Logger.info(`Send Message to Queue request received: Name ${req.params.queue}`);

        this.SQSClient
          .createQueue(req.params.queue, { MessageRetentionPeriod: retentionPeriod.toString() })
          .then((queueInfo) =>
          {
            this.SQSClient.publish(queueInfo, req.params.body)
              .then((sendMessageResult) => resp.status(200).json(sendMessageResult))
              .catch((err) => resp.status(400).json({error: err}));
          })
          .catch((err) =>
          {
            resp.status(400).json({error: err});
          });
    });

    // Get the urls of all queues
    this.router.route(`/queue`).get((req, resp) =>
    {
      this.SQSClient
        .listQueues(req.query.prefix)
        .then((queues) =>
        {
          resp.status(200).json(queues);
        })
        .catch((err) =>
        {
          resp.status(400).json({error: err});
        });
    });

    // Get the info of all queues
    this.router.route(`/queue/info`).get((req, resp) =>
    {
      this.SQSClient.getAllInfo()
          .then((queues) =>
          {
            resp.status(200).json(queues);
          })
          .catch((err) =>
          {
            resp.status(400).json({error: err});
          });
    });

    // Get info about a queue
    // There can be an optional query parameter named 'create', which if set to true, will create the queue.
    // If there queue has already been created, then the QueueInfo aboutthe queue will be returned.
    this.router.route(`/queue/:queue`)
    .get((req, resp) =>
    {
      this.SQSClient.getQueueInfo(req.params.queue, req.query.create || false)
        .then((queueInfo) =>
        {
            resp.status(200).json(queueInfo);
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    })
    // Delete a queue
    .delete((req, resp) =>
    {
      this.Logger.info(`Delete Queue request received: Name ${req.params.queue}`);
      const params = new SQSQueueInfo(req.params.queue, null, null);

      this.SQSClient.deleteQueue(params)
        .then((result) =>
        {
          resp.status(200).json({status: result});
        })
        .catch((err) =>
        {
          resp.status(400).json({error: err});
        });
    });

    // Receive a message from a queue
    this.router.route(`/queue/:queue/read`).get((req, resp) =>
    {
      this.SQSClient
        .getQueueInfo(req.params.queue, false)
        .then((queueInfo) =>
        {
          this.SQSClient.receiveMessage(queueInfo, null,
            (msg) =>
            {
              resp.status(200).json({ message: msg });
            },
            () =>
            {
              resp.status(200).json({ message: null });
            },
            (err) =>
            {
                resp.status(500).json({ error: err });
            });
        })
        .catch((err) =>
        {
          resp.status(400).json({error: err});
        });
    });
  }

  private createSNSRestAPIs(): void
  {
    // Create a topic
    this.router.route(`/topic/create`).post((req, resp) =>
    {
        const topicName: string = req.body.Name;

        // Get the attributes
        // The SNS CreateTopic function does not use attributes when the topic is created, but let's
        // take them in the REST API body, just in case .... we mnight use them internally in this framework.
        const attrs = req.body || {};

        this.Logger.info(`Create Topic request received: Name ${topicName}`);

        this.SNSClient.createTopic(topicName, attrs)
            .then((topicInfo) =>
            {
                resp.status(201).json(topicInfo);
            })
            .catch((err) =>
            {
                resp.status(400).json({error: err});
            });
    });

    // Maybe create a topic and publish a message
    this.router.route(`/topic/:topic/send/:body`).get((req, resp) =>
    {
        this.Logger.info(`Send Message to Topic request received: Name ${req.params.topic}`);

        this.SNSClient
        .createTopic(req.params.topic)
        .then((result) =>
        {
            this.SNSClient.publish(result, null, req.params.body)
               .then((sendMessageResult) => resp.status(200).json(sendMessageResult))
               .catch((err) => resp.status(400).json({error: err}));
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    });

    // Get the urls of all topics
    this.router.route(`/topic`).get((req, resp) =>
    {
        this.SNSClient
        .listTopics()
        .then((topics) =>
        {
            resp.status(200).json(topics);
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    });

    // Get the info of all topics
    this.router.route(`/topic/info`).get((req, resp) =>
    {
        this.SNSClient
        .getAllInfo()
        .then((topics) =>
        {
            resp.status(200).json(topics);
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    });

    // Get info about a topic
    this.router.route(`/topic/:topic`)
    .get((req, resp) =>
    {
        this.SNSClient
        .getTopicInfo(req.params.topic, req.query.create || false)
        .then((topicInfo) =>
        {
            resp.status(200).json(topicInfo);
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    })
    // Delete a topic
    .delete((req, resp) =>
    {
        const params = new SNSTopicInfo(req.params.topic, null);
        this.Logger.info(`Delete Topic request received: Name ${req.params.topic}`);

        this.SNSClient
        .deleteTopic(params)
        .then((result) =>
        {
            resp.status(200).json({status: result});
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    });

    // Subscribe to a topic via a queue
    this.router.route(`/topic/:topic/subscribe/:queue`).get((req, resp) =>
    {
        this.Logger.info(`Subscribe request received: topic ${req.params.topic}, queue ${req.params.queue}`);

        // We need to make sure that the topic and queue exist, and then get the ARN of the topi
        this.getTopicAndQueueInfo(req.params.topic, req.params.queue)
        .then((infos) =>
        {
            this.SNSClient.subscribeToSQS(infos[0], infos[1])
            .then((subscription) =>
            {
                this.Logger.info(`Subscribe request returned subscriptionArn: ${subscription}`);
                resp.status(200).json({subscriptionArn: subscription});
            })
            .catch((err) =>
            {
                this.Logger.error(err);
                resp.status(400).json({error: err});
            });
        })
        .catch((err) =>
        {
            this.Logger.error(err);
            resp.status(400).json({error: err});
        });
    });

    // Subscribe to a topic via a protocol and endpoint
    this.router.route(`/topic/subscribe`).post((req, resp) =>
    {
        this.Logger.info(`Subscribe request received: topic ${req.body.topic}, endpoint ${req.body.endpoint}, protocol ${req.body.protocol}`);

        // We need to make sure that the topic exists, and then get the ARN of the topic
        this.getTopicInfo(req.body.topic)
            .then((infos) =>
            {
            this.SNSClient.subscribe(infos[0], req.body.protocol, req.body.endpoint)
                .then((subscription) =>
                {
                    this.Logger.info(`Subscribe request returned subscriptionArn: ${subscription}`);
                    resp.status(200).json({subscriptionArn: subscription});
                })
                .catch((err) =>
                {
                    this.Logger.error(err);
                    resp.status(400).json({error: err});
                });
            })
            .catch((err) =>
            {
            this.Logger.error(err);
            resp.status(400).json({error: err});
            });
    });

    // Unsubscribe from a topic
    this.router.route(`/topic/unsubscribe/:subscription`).get((req, resp) =>
    {
        this.SNSClient
        .unsubscribe(req.params.subscription)
        .then((rcStatus) =>
        {
            resp.status(200).json({ status: rcStatus });
        })
        .catch((err) =>
        {
            resp.status(400).json({error: err});
        });
    });
  }

  private createCloudwatchRestAPIs(): void
  {
    // Get the urls of all alarms
    this.router.route(`/alarm`).get((req, resp) =>
    {
      this.CloudwatchClient.listCloudwatchAlarms()
        .then((alarms) =>
        {
            const alarmArns = [];
            // tslint:disable-next-line:forin
            for (const alarm in CloudwatchClient.CWAlarmMap)
            {
                const info: CloudwatchAlarmInfo = CloudwatchClient.CWAlarmMap[alarm];
                alarmArns.push({ Arn: info.Arn });
            }
            resp.status(200).json({ Alarms: alarmArns });
        })
        .catch((err) =>
        {
          resp.status(400).json({error: err});
        });
    });

    // Get the info of all alarms
    this.router.route(`/alarm/info`).get((req, resp) =>
    {
      this.CloudwatchClient.getAllInfo()
          .then((alarms) =>
          {
            resp.status(200).json(alarms);
          })
          .catch((err) =>
          {
            resp.status(400).json({ error: err });
          });
    });

    // Create an alarm for a queue and a metric
    this.router.route('/alarm/create').post((req, resp) =>
    {
      this.createAlarmForQueue(req, resp);
    });

    // Get info about an alarm
    this.router.route('/alarm/:alarmName')
    .get((req, resp) =>
    {
        this.CloudwatchClient.listCloudwatchAlarms(req.params.alarmName)
            .then((result) => resp.status(200).json(result.MetricAlarms[0] ))
            .catch((err) => resp.status(400).json({ error: err }));
    })
    // Delete an alarm
    .delete((req, resp) =>
    {
        this.CloudwatchClient.deleteAlarm(req.params.alarmName)
            .then((result) => resp.status(200).json({ status: result }))
            .catch((err) => resp.status(400).json({ error: err }));
    });

    // Set the alarm for testing
    this.router.route('/alarm/:alarmName/set').put((req, resp) =>
    {
      this.CloudwatchClient.setAlarmState(req.params.alarmName, req.body.state, req.body.reason)
          .then((result) => resp.status(200).json({ status: result }))
          .catch((err) => resp.status(500).json({ error: err }));
    });

  }
  //#endregion

  //#region Test helpers
  private async getTopicAndQueueInfo(topicName, queueName): Promise<[SNSTopicInfo, SQSQueueInfo]>
  {
      const topicInfo = await this.SNSClient.getTopicInfo(topicName, true);
      const queueInfo = await this.SQSClient.getQueueInfo(queueName, true);

      return [topicInfo, queueInfo];
  }

  private async getTopicInfo(topicName): Promise<SNSTopicInfo>
  {
      const topicInfo = await this.SNSClient.getTopicInfo(topicName, true);
      return topicInfo;
  }
  //#endregion

  //#region Public Methods
  public findServiceByType(typeName: string): AWSServiceClient
  {
    this.AWSServiceClientMap.forEach((service, name, map) =>
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

  //#region Cloudwatch Workflow
  private createAlarmForQueue(req, resp)
  {
    const queueName: string = req.body.queue;
    const metricName: string = req.body.metric;
    const period: number = req.body.period || 1;
    const evalPeriod: number = req.body.evalPeriod || 1;
    const threshold: number = req.body.threshold || 1;
    const topicName: string = req.body.topic;

    // We need to validate that the queue exists. If not, return an error.
    this.SQSClient.getQueueInfo(queueName, false)
      // Get the topic to send the notification to. If the topic doesn't exist, create it.
      .then((queueInfo) => this.SNSClient.getTopicInfo(topicName, true).then((topicInfo) => topicInfo))
      // Create any subscriptions that are needed
      // NOTE - should these subscriptions be deleted when the alarm is deleted?
      .then((topicInfo) =>
      {
        this.subscribe(topicInfo, "email", req.body.notifications.emails)
            .subscribe(topicInfo, "sqs",   req.body.notifications.queues)
            .subscribe(topicInfo, "sms",   req.body.notifications.sms)
            .subscribe(topicInfo, "lamba", req.body.notifications.lambdas)
            .subscribe(topicInfo, "http",  req.body.notifications.http)
            .subscribe(topicInfo, "https", req.body.notifications.https)
            ;
        return topicInfo;
      })
      // Create the Cloudwatch alarm for the queue.
      .then((topicInfo) =>
      {
        return this.CloudwatchClient.createAlarm(new SQSQueueInfo(queueName, null, null), metricName, period, evalPeriod, threshold, topicInfo.Arn);
      })
      // Finish up. Publish an internal event, and respond to the REST request
      .then((alarmInfo) =>
      {
        this.EventPublisher.emit("Alarm.Created", req.body);
        resp.status(201).json(alarmInfo);
      })
      .catch((err) =>
      {
        this.Logger.error(err);
        resp.sendStatus(400).json({ error: err });
      });
  }

  private subscribe(topicInfo: SNSTopicInfo, protocol: string, targets: string[]): AWSMessagingApiManager
  {
    if (targets)
    {
      for (const target of targets)
      {
        this.SNSClient.subscribe(topicInfo, protocol, target);
      }
    }
    return this;
  }
  //#endregion
}
