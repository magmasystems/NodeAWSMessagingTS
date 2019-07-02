import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { EventEmitter } from 'events';
import * as uuid from 'uuid';
import { TSLogger } from '../src/logging/tslogger';
import { IDisposable } from '../src/using';
import { Queue } from './queue';

export class TopicMessagePublishedEventEmitter extends EventEmitter {}

class Topic<T> extends Queue<T>
{
}

export class SNSMocks implements IDisposable
{
  private Logger: any;
  private static Topics: Map<string, Topic<{}>>;
  private static Subscriptions: Map<string, {}> = new Map<string, {}>();
  // A topic can have 1 or more subscriptions, which each subscription is referenced by a subscription ARN.
  private static TopicToSubscriptionsMap: Map<string, Set<string>> = new Map<string, Set<string>>();

  // So that queues know when they have been forced to subscribe to a topic
  public static TopicEventEmitter: TopicMessagePublishedEventEmitter = new TopicMessagePublishedEventEmitter();

  private static instance: SNSMocks;

  private constructor()
  {
    SNSMocks.Topics = new Map<string, Topic<{}>>();
  }

  public static Instance(): SNSMocks
  {
    if (SNSMocks.instance)
    {
      return SNSMocks.instance;
    }

    SNSMocks.instance = new SNSMocks();
    SNSMocks.instance.Create();
    return SNSMocks.instance;
  }

  private Create()
  {
    this.Logger = new TSLogger().createLogger(`SNSMock`);

    AWSMock.setSDKInstance(AWS);

    AWSMock.mock('SNS', 'createTopic', (params, callback) =>
    {
      // The response has TopicArn property, and that is what is used by the SNSClient.createTopic() function
      const topicName: string = params.Name;
      const arn: string = `arn:aws:sns:us-west-2:901643335044:${topicName}`;
      SNSMocks.Topics[arn] = new Topic<{}>(arn);
      callback(null, { TopicArn: arn });
    });

    AWSMock.mock('SNS', 'deleteTopic', (params, callback) =>
    {
      const arn: string = params.TopicArn;
      const topic = SNSMocks.Topics[arn];
      if (topic)
      {
        SNSMocks.Topics.delete(arn);
        callback(null, {});
      }
      else
      {
        callback(`The topic ${arn} does not exist`, null);
      }
    });

    AWSMock.mock('SNS', 'getTopicAttributes', (params, callback) =>
    {
        callback(null, { Attributes : { TopicArn: params }} );
    });

    AWSMock.mock('SNS', 'listTopics', (params, callback) =>
    {
      callback(null,
        {
          Topics:
            [
              { TopicArn: `arn:aws:sns:us-west-2:901643335044:foo-baz-topic`  },
              { TopicArn: `arn:aws:sns:us-west-2:901643335044:nut-case-topic` },
            ],
        });
    });

    AWSMock.mock('SNS', 'publish', (params, callback) =>
    {
      const arn: string = params.TopicArn;
      const subject: string = params.Subject;
      const message: string = params.Message;

      const topic: Topic<{}> = SNSMocks.Topics[arn];
      if (topic)
      {
        const messageId: string = uuid.v1();
        topic.enqueue({ MessageId: messageId, MessageBody: message, Subject: subject });
        callback(null, { MessageId: messageId });

        // Note - we should trigger all subscribers to this topic
        const subs: Set<string> = SNSMocks.TopicToSubscriptionsMap[arn];
        if (subs)
        {
          // 'subs' is a Set of all subscription ARNs for this topic.
          // The subscription ARN can be used to look in SNSMocks.Subscriptions[] for the
          // subscription information for each subscriber.
          subs.forEach((value, value2, set) =>
          {
            const subArn: string = value;
            const subscriptionInfo = SNSMocks.Subscriptions[subArn];
            if (subscriptionInfo)
            {
              SNSMocks.TopicEventEmitter.emit("TopicMessageAvailable", subscriptionInfo);
            }
          });
        }
      }
      else
      {
        callback(`The topic ${arn} does not exist`, null);
      }
    });

    AWSMock.mock('SNS', 'subscribe', (params, callback) =>
    {
      /*
            const request =
            {
                Endpoint: queueInfo.Arn,
                Protocol: 'sqs',
                TopicArn: topicInfo.Arn,
              };
      */
      const arn: string = params.TopicArn;
      const protocol: string = params.Protocol;
      const endpoint: string = params.Endpoint;

      const topic: Topic<{}> = SNSMocks.Topics[arn];
      if (topic)
      {
        const subscriptionArn: string = uuid.v1();
        SNSMocks.Subscriptions[subscriptionArn] = params;

        // Map the topic to its subscriptions
        if (!SNSMocks.TopicToSubscriptionsMap[arn])
        {
          SNSMocks.TopicToSubscriptionsMap[arn] = new Set<string>();
        }
        SNSMocks.TopicToSubscriptionsMap[arn].add(subscriptionArn);

        // Let the SQSClient know that they have been subscribed to a topic
        if (protocol.toLocaleLowerCase() === "sqs")
        {
          SNSMocks.TopicEventEmitter.emit("TopicSubscribed", params);
        }

        callback(null, { SubscriptionArn: subscriptionArn });
      }
      else
      {
        callback(`The topic ${arn} does not exist`, null);
      }
    });

    AWSMock.mock('SNS', 'unsubscribe', (params, callback) =>
    {
      const subscriptionArn: string = params.SubscriptionArn;
      const subscription = SNSMocks.Subscriptions[subscriptionArn];
      if (subscription)
      {
        // Get rid of the subscription from a Topic's list of subscriptions
        const topicArn: string = subscription.TopicArn;
        if (SNSMocks.TopicToSubscriptionsMap[topicArn])
        {
          SNSMocks.TopicToSubscriptionsMap[topicArn].delete(subscriptionArn);
        }

        delete SNSMocks.Subscriptions[subscriptionArn];
        callback(null, {});
      }
      else
      {
        callback(`The subscription ${subscriptionArn} does not exist`, null);
      }
    });
  }

  public dispose(): void
  {

  }
}
