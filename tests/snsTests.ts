import { AppContext } from '../src/appContext';
import { SNSClient, SNSTopicInfo } from '../src/aws/snsClient';
import { SQSClient, SQSQueueInfo } from '../src/aws/sqsClient';
import { AWSMessagingApiManager } from '../src/awsMessagingApiManager';
import { ServiceCreationArgs } from '../src/services/serviceCreationArgs';

export class SNSTester
{
    private snsClient: SNSClient;
    private sqsClient: SQSClient;

    // /sns/test/publish?:numMessages
    public testSNSPublish(queryParams: any): void
    {
        let numMessages = 10;
        if (queryParams && queryParams.numMessages)
        {
            numMessages = queryParams.numMessages;
        }

        const topicName = this.getAppSettings().topicName;

        this.sendMessagesToTopic(topicName, numMessages);
    }

    // /sns/test/subscribe
    public testSNSSubscribe(queryParams: any): void
    {
        // tslint:disable-next-line:no-unused-expression
        queryParams;  // make sure this is used

        const topicName = this.getAppSettings().topicName;
        const queueName = this.getAppSettings().queueName;

        // Note that someone must execute the testSNSPublish call in another browser/Postman tab

        this.receiveMessagesFromTopic(topicName, queueName);
    }

    constructor()
    {
        this.ensureSNS();
        this.ensureSQS();
    }

    public getAppSettings(): any
    {
        const config = this.snsClient.AWSClient.Configuration;
        return config.appSettings;
    }

    private ensureSNS(): void
    {
        if (this.snsClient === undefined)
        {
            this.snsClient = new SNSClient(new ServiceCreationArgs());
        }
    }

    private ensureSQS(): void
    {
        if (this.sqsClient === undefined)
        {
            this.sqsClient = new SQSClient(new ServiceCreationArgs());
        }
    }

    public sendMessagesToTopic(topicName, numMessages = 10): void
    {
        this.ensureSNS();

        const snsClientProducer = new SNSClient(new ServiceCreationArgs());

        // Create an SNS topic
        snsClientProducer
            .createTopic(topicName)
            .then((topicInfo) =>
            {
                for (let i = 1;  i <=  numMessages;  i++)
                {
                    const msgText = `Adler Topic Message ${i}`;
                    snsClientProducer.publish(topicInfo, 'Customer.LoggedIn', msgText);
                }
            });
    }

    public receiveMessagesFromTopic(topicName, queueName): void
    {
        this.ensureSNS();
        this.ensureSQS();

        // If the topic does not exist, then create the SNS topic. The same for the queue.

        /*
        let topicInfoPromise = snsClient.getTopicInfo(topicName, true);
        let queueInfoPromise = sqsClient.getQueueInfo(queueName, true);
        Promise.all([topicInfoPromise, queueInfoPromise]).then(values =>
        {
            // Subscribe to the SNS topic
            let topicInfo = values[0];
            let queueInfo = values[1];
            snsClient.subscribeToSQS(topicInfo, queueInfo).then(snsTopicSubscriberArn =>
            {
                return snsTopicSubscriberArn;
            });
        });
        */

        this.getTopicAndQueueInfo(topicName, queueName).then((infos) =>
        {
            this.snsClient.subscribeToSQS(infos[0], infos[1]).then((snsTopicSubscriberArn) =>
            {
                return snsTopicSubscriberArn;
            });
        });
    }

    private async getTopicAndQueueInfo(topicName, queueName): Promise<[SNSTopicInfo, SQSQueueInfo]>
    {
        const topicInfo = await this.snsClient.getTopicInfo(topicName, true);
        const queueInfo = await this.sqsClient.getQueueInfo(queueName, true);

        return [topicInfo, queueInfo];
    }

    public static CreateRestTests(api: AWSMessagingApiManager): void
    {
        api.Express.get(`${AppContext.RestTopicApiPrefix}/test/publish?:numMessages?`, (req, resp) =>
        {
            new SNSTester().testSNSPublish(req.query);
            resp.send('Messages published');
        });

        api.Express.get(`${AppContext.RestTopicApiPrefix}/test/subscribe`, (req, resp) =>
        {
            new SNSTester().testSNSSubscribe(req.query);
            resp.send('Messages subscribed');
        });
    }
}
