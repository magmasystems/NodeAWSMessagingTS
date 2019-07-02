'use strict';

// import entire SDK
/// <reference types="aws-sdk" />
import * as AWS from 'aws-sdk';
import * as SNS from 'aws-sdk/clients/sns';
import { AppContext } from '../appContext';
import { AWSMessagingApiManager } from '../awsMessagingApiManager';
import { AWSMessagingServerSettings, IAWSMessagingServerSettings } from '../awsMessagingServerSettings';
import { AWSResourceInfoBase } from '../awsResourceInfoBase';
import { AWSResourceWatcher } from '../awsResourceWatcher';
import { IServiceCreationArgs } from '../services/serviceCreationArgs';
import { AWSServiceClient } from './awsServiceClient';
import { SQSQueueInfo } from './sqsClient';

/**
 *
 *
 * @export
 * @class SNSTopicInfo
 */
export class SNSTopicInfo extends AWSResourceInfoBase
{
    constructor(name: string, arn: string, attributes: any = {})
    {
        super("Topic", name, arn, attributes);

        this.toString = () => `SNSTopicInfo: name=${this.Name}, Arn=${this.Arn}`;
    }
}

/**
 *
 *
 * @export
 * @class SNSClient
 * @extends {AWSServiceClient}
 */
export class SNSClient extends AWSServiceClient
{
    public static TopicMap: any;
    public static ResourceWatcher: SNSResourceWatcher;
    public static SubscriptionMap: Map<string, any> = new Map<string, any>();

    private InternalClient: SNS;

    constructor(args: IServiceCreationArgs)
    {
        super('SNS', args.Name, args.Settings);
        this.InternalClient = this.createClient();
        this.initTopicMap(undefined);
    }

    private constructor2(name: string = 'SNS Client', attrs?: any, settings?: IAWSMessagingServerSettings)
    {
        // super('SNS', name, settings);
        this.InternalClient = this.createClient();
        this.initTopicMap(attrs);
    }

    private initTopicMap(attrs?: any)
    {
        if (!SNSClient.TopicMap)
        {
            SNSClient.TopicMap = {};

            if (!attrs || !attrs.noPreloadInfo)
            {
                this.getAllInfo()
                    .then((topicMap) => this.swapInfoMap(topicMap))
                    .catch((err) => this.Logger.error(err));
            }

            SNSClient.ResourceWatcher = SNSResourceWatcher.Instance(this);
        }
    }

    private createClient(): SNS
    {
        if (AppContext.IsMocking)
        {
            return new AWS.SNS();
        }
        else
        {
            return new SNS({ region: this.AWSClient.Configuration.sns.region, apiVersion: '2012-11-05' });
        }
    }

    public getServiceConfiguration(): any
    {
        return super.getServiceConfiguration().sns;
    }

    /**
     * swapInfoMap
     * This gets called when the AWS list of all of the Topics/Queues has changed.
     * This gets called in the constructor, or by the resource watcher when a change has been
     * detected to the list. In the latter case, a callback is called to let subscribers
     * know that the resource list has changed.
     *
     * @param {{}} newMap
     * @param {boolean} [fireChangeEvent=false]
     * @memberof SNSClient
     */
    public swapInfoMap(newMap: {}, fireChangeEvent: boolean = false): void
    {
        SNSClient.TopicMap = newMap;
        super.swapInfoMap(newMap, fireChangeEvent);
    }

    public getCurrentInfoMap(): {}
    {
        return SNSClient.TopicMap;
    }

    /**
     *
     *
     * @param {string} topicName
     * @returns {Promise<SNSTopicInfo>}
     * @memberof SNSClient
     */
    public createTopic(topicName: string, attrs: any = {}): Promise<SNSTopicInfo>
    {
        // If we created the topic already, then just return this topic
        if (SNSClient.TopicMap[topicName] !== undefined)
        {
            return new Promise((resolve, _) => resolve(SNSClient.TopicMap[topicName]));
        }

        // CreateTopicRequest only takes a topic name, but no attributes.
        // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SNS.html#createTopic-property
        const createTopicRequest =
        {
            Name: topicName,
        };

        return new Promise((resolve, reject) =>
        {
            this.InternalClient.createTopic(createTopicRequest, (err, topicResp) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    this.InternalClient.getTopicAttributes({ TopicArn: topicResp.TopicArn }, (err2, result) =>
                    {
                        if (err2)
                        {
                            this.Logger.error(err2);
                            reject(err2);
                        }
                        else
                        {
                            const topicInfo = new SNSTopicInfo(topicName, topicResp.TopicArn, result.Attributes);
                            SNSClient.TopicMap[topicName] = topicInfo;
                            resolve(topicInfo);
                            this.EventPublisher.emit('Topic.Created', topicInfo.Name);
                        }
                    });
                }
            });
        });
    }

    /**
     * getAllInfo
     *
     * @returns {Promise<any>}
     * @memberof SNSClient
     */
    public async getAllInfo(): Promise<{}>
    {
        const listOfTopics = await this.listTopics();

        return new Promise((resolve, reject) =>
        {
            const topicMap = {};
            const promises = [];

            // tslint:disable-next-line:prefer-for-of
            for (let i = 0;  i <  listOfTopics.Topics.length;  i++)
            {
                const arn: string = listOfTopics.Topics[i].TopicArn;
                promises.push(
                    this.InternalClient.getTopicAttributes({ TopicArn: arn }, (err, result) =>
                    {
                        if (err)
                        {
                            this.Logger.error(err);
                        }
                        else
                        {
                            const topicName: string = this.extractNameFromArn(arn);
                            topicMap[topicName] = new SNSTopicInfo(topicName, arn, result.Attributes);
                        }
                    }).promise());
            }

            // Wait for all of the topic attribute requests to be completed.
            // Then set the global TopicMap.
            Promise.all(promises)
                .then((q) =>
                {
                    resolve(topicMap);
                })
                .catch((err) => this.Logger.error(err));
        });
    }

    /**
     * listTopics - returns a list of strings, each one is a URL of a SQS Topic
     *
     * @returns {Promise<SNS.ListTopicsResponse>} - an array of Topic, whefre each Topic as a TopicArn
     * @memberof SNSClient
     */
    public listTopics(): Promise<SNS.ListTopicsResponse>
    {
        const params = {};

        return new Promise((resolve, reject) =>
        {
            this.InternalClient.listTopics(params, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    resolve(result);
                }
            });
        });
    }

    /**
     * getTopicInfo
     *
     * @param {string} topicName
     * @param {boolean} [createTopicIfNoExist=true]
     * @returns {Promise<SNSTopicInfo>}
     * @memberof SNSClient
     */
    public getTopicInfo(topicName: string, createTopicIfNoExist: boolean = true): Promise<SNSTopicInfo>
    {
        if (SNSClient.TopicMap[topicName] !== undefined)
        {
            return new Promise((resolve, _) => resolve(SNSClient.TopicMap[topicName]));
        }

        if (!createTopicIfNoExist)
        {
            return new Promise((resolve, _) => resolve(null));
        }

        return new Promise((resolve, reject) =>
        {
            let topicInfo = null;

            this.createTopic(topicName)
                .then(() =>
                {
                    topicInfo = SNSClient.TopicMap[topicName];
                    if (topicInfo == null) {
                        reject(null);
                    }
                    else {
                        resolve(topicInfo);
                    }
                });
        });
    }

    /**
     * deleteTopic
     *
     * @param {SNSTopicInfo} topicInfo
     * @returns {Promise<{}>}
     * @memberof SNSClient
     */
    public deleteTopic(topicInfo: SNSTopicInfo): Promise<boolean>
    {
        return new Promise((resolve, reject) =>
        {
            const topicInfo2 = SNSClient.TopicMap[topicInfo.Name];
            if (!topicInfo2)
            {
                reject(`There is no topic named ${topicInfo.Name}`);
                return;
            }

            this.InternalClient.deleteTopic({ TopicArn: topicInfo2.Arn }, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(`Problem deleting the topic ${topicInfo2.Name}: ${err}`);
                    reject(err);
                }
                else
                {
                    this.Logger.info(`Deleting the topic ${topicInfo2.Name}`);
                    delete SNSClient.TopicMap[topicInfo2.Name];
                    resolve(true);
                    this.EventPublisher.emit('Topic.Deleted', topicInfo2.Name);
                }
            });
        });
    }

    /**
     * publish
     *
     * @param {SNSTopicInfo} topicInfo
     * @param {string} subject
     * @param {string} body
     * @returns {Promise<SNS.PublishResponse>}
     * @memberof SNSClient
     */
    public publish(topicInfo: SNSTopicInfo, subject: string, body: string): Promise<SNS.PublishResponse>
    {
        /*
            var params = {
              Message: 'STRING_VALUE', // required
              MessageAttributes: {
                '<String>': {
                  DataType: 'STRING_VALUE', // required
                  BinaryValue: new Buffer('...') || 'STRING_VALUE', // Strings will be Base-64 encoded
                  StringValue: 'STRING_VALUE'
                },
                //'<String>': ...
              },
              MessageStructure: 'STRING_VALUE',
              PhoneNumber: 'STRING_VALUE',
              Subject: 'STRING_VALUE',
              TargetArn: 'STRING_VALUE',
              TopicArn: 'STRING_VALUE'
            };
        */

        const request =
        {
            Message: body,
            Subject: subject,
            TopicArn: topicInfo.Arn,
        };

        return new Promise((resolve, reject) =>
        {
            this.InternalClient.publish(request, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(`Problem publishing the message to the topic ${topicInfo.Name}: ${err}`);
                    reject(err);
                }
                else
                {
                    resolve(result);
                }
            });
        });
    }

    /**
     * subscribeToSQS
     *
     * @param {SNSTopicInfo} topicInfo
     * @param {SQSQueueInfo} queueInfo
     * @returns {Promise<string>}
     * @memberof SNSClient
     */
    public subscribeToSQS(topicInfo: SNSTopicInfo, queueInfo: SQSQueueInfo): Promise<string>
    {
        return this.subscribe(topicInfo, 'sqs', queueInfo.Arn);
    }

    /**
     * subscribe
     *
     * @param {SNSTopicInfo} topicInfo
     * @param {string} [protocol='sqs']
     * @param {string} endpoint
     * @returns {Promise<string>}
     * @memberof SNSClient
     */
    public subscribe(topicInfo: SNSTopicInfo, protocol: string = 'sqs', endpoint: string): Promise<string>
    {
        return new Promise((resolve, reject) =>
        {
            const request =
            {
                Endpoint: endpoint,
                Protocol: protocol,      /* required */
                TopicArn: topicInfo.Arn, /* required */
            };

            this.InternalClient.subscribe(request, (err, resp) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    resolve(resp.SubscriptionArn);
                    SNSClient.SubscriptionMap.set(resp.SubscriptionArn, request);
                    this.EventPublisher.emit('Topic.Subscribed', { subscriptionRequest: request, subscriptionArn: resp.SubscriptionArn });
                }
            });
        });
    }

    /**
     * unsubscribe
     *
     * @param {string} subscription
     * @returns {Promise<boolean>}
     * @memberof SNSClient
     */
    public unsubscribe(subscription: string): Promise<boolean>
    {
        return new Promise((resolve, reject) =>
        {
            this.InternalClient.unsubscribe({ SubscriptionArn: subscription }, (err, resp) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    resolve(true);
                    this.EventPublisher.emit('Topic.Unsubscribed', subscription);
                }
            });
        });
    }

    private testEventPublisher(): void
    {
        this.EventPublisher.emit('Topic.Created', 'foo.baz');
        this.EventPublisher.emit('Topic.Deleted', 'foo.baz');
    }
}

// singleton
export class SNSResourceWatcher extends AWSResourceWatcher
{
    private static instance: SNSResourceWatcher;

    public static Instance(client: SNSClient): SNSResourceWatcher
    {
        if (SNSResourceWatcher.instance == null)
        {
            SNSResourceWatcher.instance = new SNSResourceWatcher(client);
        }
        return SNSResourceWatcher.instance;
    }
}
