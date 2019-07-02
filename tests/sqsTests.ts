import { SQS } from 'aws-sdk';
import { AWSMessagingServer, MessageReceivedCallback, SQSQueueInfo } from '../index';
import { AppContext } from '../src/appContext';
import { SQSClient } from '../src/aws/sqsClient';
import { AWSMessagingApiManager } from '../src/awsMessagingApiManager';
import { ServiceCreationArgs } from '../src/services/serviceCreationArgs';
import { RequestResponseTest } from './requestResponseTest';

export class SQSTester
{
    public sqsClient: SQSClient;
    private Server: AWSMessagingServer;

    constructor(server: AWSMessagingServer)
    {
        this.Server = server;
        this.ensureSQS();
    }

    private ensureSQS(): void
    {
        if (!this.sqsClient)
        {
            const serviceCreationArgs: ServiceCreationArgs = { Settings: this.Server.Settings, ServiceType: 'AWS', Name: 'Test SQS Client' };
            this.sqsClient = new SQSClient(serviceCreationArgs);
        }
    }

    private getAppSettings(): any
    {
        const config = this.sqsClient.AWSClient.Configuration;
        return config.appSettings;
    }

    public createQueue(queueName: string): Promise<SQSQueueInfo>
    {
        return this.sqsClient.createQueue(queueName);
    }

    public sendMessagesToQueue(queueName: string, numMessages: number, message?: string): void
    {
        // Create the SQS queue clients - one for the producer and 2 for the consumers
        const sqsClientProducer = this.sqsClient;
        const appSettings = this.getAppSettings();

        // Create the SQS queue
        queueName = queueName || appSettings.queueName;
        numMessages = numMessages || 10;

        const promises = new Array<Promise<SQS.SendMessageResult>>();

        sqsClientProducer
            .createQueue(queueName)
            .then((queueInfo) =>
            {
                for (let i = 1;  i <= numMessages;  i++)
                {
                    let msgText = message || 'Adler Queue Message ${seq}';
                    msgText = msgText.replace('${seq}', i.toString());
                    promises.push(sqsClientProducer.publish(queueInfo, msgText));
                }
            });

        // Wait for all of the messages to be sent
        Promise.all(promises);
    }

    public receiveMessagesFromQueue(queueName: string, numConsumers: number, messageReceivedCallback?: MessageReceivedCallback, disposeConsumer?: boolean): void
    {
        // Create the SQS queue clients - one for the producer and 2 for the consumers
        const appSettings = this.getAppSettings();
        numConsumers = numConsumers || appSettings.numConsumers || 1;
        const sqsClientConsumers: SQSClient[] = [];
        for (let i = 0; i < numConsumers; i++)
        {
            const serviceCreationArgs: ServiceCreationArgs = { Name: `SQS Consumer ${i}` };
            sqsClientConsumers.push(new SQSClient(serviceCreationArgs));
        }

        disposeConsumer = disposeConsumer !== undefined ? disposeConsumer : true;

        // Create the SQS queue
        queueName = queueName || appSettings.queueName;

        // Fetch a message
        for (let i = 0; i < numConsumers; i++)
        {
            const consumer = sqsClientConsumers[i];  // assign to a var to get around closure issues
            consumer.createQueue(queueName)
                .then((queueInfo) =>
                {
                    consumer.receiveMessage(queueInfo, null,
                        (msg) =>
                        {
                            console.log(`SQSTestReceive: ${consumer.Name} got message [${msg.Body}]`);
                            if (messageReceivedCallback)
                            {
                                messageReceivedCallback(msg);
                            }
                            if (disposeConsumer === true)
                            {
                                consumer.dispose();
                            }
                        },
                        () =>         // No msg received
                        {
                            console.log(`SQSTestReceive: ${consumer.Name} got no message`);
                            if (disposeConsumer === true)
                            {
                                consumer.dispose();
                            }
                        });
                });
        }
    }

    // /sqs/test/:queue/send?:numMessages
    private testSQSSend(queryParams: any)
    {
        this.sendMessagesToQueue(queryParams.queue, queryParams.numMessages, queryParams.message);
    }

    // /sqs/test/:queue/receive?:numMessages
    private testSQSReceive(queryParams: any)
    {
        this.receiveMessagesFromQueue(queryParams.queue, queryParams.numConsumers);
    }

    public static CreateRestTests(servers: AWSMessagingServer[]): void
    {
        servers[0].App.get(`${AppContext.RestQueueApiPrefix}/test/:queue/send?:numMessages?:message?`, (req, resp) =>
        {
            new SQSTester(servers[0]).testSQSSend(req.query);
            resp.send('Messages sent');
        });

        servers[0].App.get(`${AppContext.RestQueueApiPrefix}/test/:queue/receive?:numConsumers?`, (req, resp) =>
        {
            new SQSTester(servers[0]).testSQSReceive(req.query);
            resp.send('Messages received');
        });

        servers[0].App.get(`${AppContext.RestQueueApiPrefix}/test/requestresponse`, (req, resp) =>
        {
            new RequestResponseTest().testRequestResponse(servers)
                .then((rc) => resp.json({status: rc}))
                .catch((err) => resp.setStatus(500).json({status: err}));
        });
    }
}
