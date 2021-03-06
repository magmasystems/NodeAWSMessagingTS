'use strict';

// import entire SDK
/// <reference types="aws-sdk" />
import * as AWS from 'aws-sdk';
import * as SNS from 'aws-sdk/clients/sns';
import express = require('express');
import { AppContext } from '../appContext';
import { AWSResourceInfoBase } from '../awsResourceInfoBase';
import { AWSResourceWatcher } from '../awsResourceWatcher';
import { IServiceCreationArgs } from '../services/serviceCreationArgs';
import { AWSServiceClient } from './awsServiceClient';
import { SQSClient, SQSQueueInfo } from './sqsClient';

/**
 *
 *
 * @export
 * @class SNSTopicInfo
 */
export class SNSTopicInfo extends AWSResourceInfoBase {
    constructor(name: string, arn: string, attributes: any = {}) {
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
export class SNSClient extends AWSServiceClient {
    public static TopicMap: any;
    public static ResourceWatcher: SNSResourceWatcher;
    public static SubscriptionMap: Map<string, any> = new Map<string, any>();

    private InternalClient: SNS;

    constructor(args: IServiceCreationArgs) {
        args.Name = 'SNS';
        super(args);

        this.InternalClient = this.createClient();
        this.initTopicMap(undefined);
    }

    private initTopicMap(attrs?: any) {
        if (!SNSClient.TopicMap) {
            SNSClient.TopicMap = {};

            if (!attrs || !attrs.noPreloadInfo) {
                this.getAllInfo()
                    .then((topicMap) => this.swapInfoMap(topicMap))
                    .catch((err) => this.Logger.error(err));
            }

            SNSClient.ResourceWatcher = SNSResourceWatcher.Instance(this);
        }
    }

    private createClient(): SNS {
        if (AppContext.IsMocking) {
            return new AWS.SNS();
        }
        else {
            return new SNS({ region: this.AWSClient.Configuration.sns.region, apiVersion: '2012-11-05' });
        }
    }

    public getServiceConfiguration(): any {
        return super.getServiceConfiguration().sns;
    }

    public createApi(router: express.Router): void {
        super.createApi(router);

        const entity = 'topic';

        // Create a topic
        router.route(`/${entity}/create`).post((req, resp) => this.apiCreateTopic(req, resp));

        // Maybe create a topic and publish a message
        router.route(`/${entity}/:topic/send/:body`).get((req, resp) => this.apiPublishMessage(req, resp));

        // Get the urls of all topics
        router.route(`/${entity}`).get((req, resp) => this.apiGetTopicUrls(req, resp));

        // Get the info of all topics
        router.route(`/${entity}/info`).get((req, resp) => this.apiGetAllTopicInfo(req, resp));

        // Get info about a topic
        router.route(`/${entity}/:topic`)
            .get((req, resp) => this.apiGetTopicInfo(req, resp))
            // Delete a topic
            .delete((req, resp) => this.apiDeleteTopic(req, resp));

        // Subscribe to a topic via a queue
        router.route(`/${entity}/:topic/subscribe/:queue`).get((req, resp) => this.apiSubscribeToSQS(req, resp));

        // Subscribe to a topic via a protocol and endpoint
        router.route(`/${entity}/subscribe`).post((req, resp) => this.apiSubscribe(req, resp));

        // Unsubscribe from a topic
        router.route(`/${entity}/unsubscribe/:subscription`).get((req, resp) => this.apiUnsubscribe(req, resp));
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
    public swapInfoMap(newMap: {}, fireChangeEvent: boolean = false): void {
        SNSClient.TopicMap = newMap;
        super.swapInfoMap(newMap, fireChangeEvent);
    }

    public getCurrentInfoMap(): {} {
        return SNSClient.TopicMap;
    }

    //#region API Functions
    private apiCreateTopic(req, resp): void {
        const topicName: string = req.body.Name;

        // Get the attributes
        // The SNS CreateTopic function does not use attributes when the topic is created, but let's
        // take them in the REST API body, just in case .... we mnight use them internally in this framework.
        const attrs = req.body || {};

        this.Logger.info(`Create Topic request received: Name ${topicName}`);

        this.createTopic(topicName, attrs)
            .then((topicInfo) => { resp.status(201).json(topicInfo); })
            .catch((err) => { resp.status(400).json({ error: err }); });
    }

    private apiDeleteTopic(req, resp): void
    {
        const params = new SNSTopicInfo(req.params.topic, null);
        this.Logger.info(`Delete Topic request received: Name ${req.params.topic}`);

        this.deleteTopic(params)
            .then((result) => { resp.status(200).json({ status: result }); })
            .catch((err) => { resp.status(400).json({ error: err }); });
    }

    private apiPublishMessage(req, resp): void
    {
        this.Logger.info(`Send Message to Topic request received: Name ${req.params.topic}`);

        this.createTopic(req.params.topic)
            .then((result) => {
                this.publish(result, null, req.params.body)
                    .then((sendMessageResult) => resp.status(200).json(sendMessageResult))
                    .catch((err) => resp.status(400).json({ error: err }));
            })
            .catch((err) => {
                resp.status(400).json({ error: err });
            });
    }

    private apiGetTopicUrls(req, resp): void
    {
        this.listTopics()
            .then((topics) => { resp.status(200).json(topics); })
            .catch((err) => { resp.status(400).json({ error: err }); });
    }

    private apiGetAllTopicInfo(req, resp): void
    {
        this.getAllInfo()
            .then((topics) => { resp.status(200).json(topics); })
            .catch((err) => { resp.status(400).json({ error: err }); });
    }

    private apiGetTopicInfo(req, resp): void
    {
        this.getTopicInfo(req.params.topic, req.query.create || false)
            .then((topicInfo) => { resp.status(200).json(topicInfo); })
            .catch((err) => { resp.status(400).json({ error: err }); });
    }

    private apiSubscribe(req, resp): void
    {
        this.Logger.info(`Subscribe request received: topic ${req.body.topic}, endpoint ${req.body.endpoint}, protocol ${req.body.protocol}`);

        // We need to make sure that the topic exists, and then get the ARN of the topic
        this.getTopicInfo(req.body.topic)
            .then((infos) => {
                this.subscribe(infos[0], req.body.protocol, req.body.endpoint)
                    .then((subscription) => {
                        this.Logger.info(`Subscribe request returned subscriptionArn: ${subscription}`);
                        resp.status(200).json({ subscriptionArn: subscription });
                    })
                    .catch((err) => {
                        this.Logger.error(err);
                        resp.status(400).json({ error: err });
                    });
            })
            .catch((err) => {
                this.Logger.error(err);
                resp.status(400).json({ error: err });
            });
    }

    private apiSubscribeToSQS(req, resp): void
    {
        this.Logger.info(`Subscribe request received: topic ${req.params.topic}, queue ${req.params.queue}`);

        // We need to make sure that the topic and queue exist, and then get the ARN of the topi
        this.getTopicAndQueueInfo(req.params.topic, req.params.queue)
            .then((infos) => {
                this.subscribeToSQS(infos[0], infos[1])
                    .then((subscription) => {
                        this.Logger.info(`Subscribe request returned subscriptionArn: ${subscription}`);
                        resp.status(200).json({ subscriptionArn: subscription });
                    })
                    .catch((err) => {
                        this.Logger.error(err);
                        resp.status(400).json({ error: err });
                    });
            })
            .catch((err) => {
                this.Logger.error(err);
                resp.status(400).json({ error: err });
            });
    }

    private apiUnsubscribe(req, resp): void
    {
        this.unsubscribe(req.params.subscription)
            .then((rcStatus) => {
                resp.status(200).json({ status: rcStatus });
            })
            .catch((err) => {
                resp.status(400).json({ error: err });
            });
    }
    //#endregion

    private async getTopicAndQueueInfo(topicName, queueName): Promise<[SNSTopicInfo, SQSQueueInfo]> {
        const sqsClient: SQSClient = this.Manager.getService<SQSClient>("SQS");

        const topicInfo = await this.getTopicInfo(topicName, true);
        const queueInfo = await sqsClient.getQueueInfo(queueName, true);

        return [topicInfo, queueInfo];
    }

    /**
     *
     *
     * @param {string} topicName
     * @returns {Promise<SNSTopicInfo>}
     * @memberof SNSClient
     */
    public createTopic(topicName: string, attrs: any = {}): Promise<SNSTopicInfo> {
        // If we created the topic already, then just return this topic
        if (SNSClient.TopicMap[topicName] !== undefined) {
            return new Promise((resolve, _) => resolve(SNSClient.TopicMap[topicName]));
        }

        // CreateTopicRequest only takes a topic name, but no attributes.
        // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SNS.html#createTopic-property
        const createTopicRequest =
        {
            Name: topicName,
        };

        return new Promise((resolve, reject) => {
            this.InternalClient.createTopic(createTopicRequest, (err, topicResp) => {
                if (err) {
                    this.Logger.error(err);
                    reject(err);
                }
                else {
                    this.InternalClient.getTopicAttributes({ TopicArn: topicResp.TopicArn }, (err2, result) => {
                        if (err2) {
                            this.Logger.error(err2);
                            reject(err2);
                        }
                        else {
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
    public async getAllInfo(): Promise<{}> {
        const listOfTopics = await this.listTopics();

        return new Promise((resolve, reject) => {
            const topicMap = {};
            const promises = [];

            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < listOfTopics.Topics.length; i++) {
                const arn: string = listOfTopics.Topics[i].TopicArn;
                promises.push(
                    this.InternalClient.getTopicAttributes({ TopicArn: arn }, (err, result) => {
                        if (err) {
                            this.Logger.error(err);
                        }
                        else {
                            const topicName: string = this.extractNameFromArn(arn);
                            topicMap[topicName] = new SNSTopicInfo(topicName, arn, result.Attributes);
                        }
                    }).promise());
            }

            // Wait for all of the topic attribute requests to be completed.
            // Then set the global TopicMap.
            Promise.all(promises)
                .then((q) => {
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
    public listTopics(): Promise<SNS.ListTopicsResponse> {
        const params = {};

        return new Promise((resolve, reject) => {
            this.InternalClient.listTopics(params, (err, result) => {
                if (err) {
                    this.Logger.error(err);
                    reject(err);
                }
                else {
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
    public getTopicInfo(topicName: string, createTopicIfNoExist: boolean = true): Promise<SNSTopicInfo> {
        if (SNSClient.TopicMap[topicName] !== undefined) {
            return new Promise((resolve, _) => resolve(SNSClient.TopicMap[topicName]));
        }

        if (!createTopicIfNoExist) {
            return new Promise((resolve, _) => resolve(null));
        }

        return new Promise((resolve, reject) => {
            let topicInfo = null;

            this.createTopic(topicName)
                .then(() => {
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
    public deleteTopic(topicInfo: SNSTopicInfo): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const topicInfo2 = SNSClient.TopicMap[topicInfo.Name];
            if (!topicInfo2) {
                reject(`There is no topic named ${topicInfo.Name}`);
                return;
            }

            this.InternalClient.deleteTopic({ TopicArn: topicInfo2.Arn }, (err, result) => {
                if (err) {
                    this.Logger.error(`Problem deleting the topic ${topicInfo2.Name}: ${err}`);
                    reject(err);
                }
                else {
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
    public publish(topicInfo: SNSTopicInfo, subject: string, body: string): Promise<SNS.PublishResponse> {
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

        return new Promise((resolve, reject) => {
            this.InternalClient.publish(request, (err, result) => {
                if (err) {
                    this.Logger.error(`Problem publishing the message to the topic ${topicInfo.Name}: ${err}`);
                    reject(err);
                }
                else {
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
    public subscribeToSQS(topicInfo: SNSTopicInfo, queueInfo: SQSQueueInfo): Promise<string> {
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
    public subscribe(topicInfo: SNSTopicInfo, protocol: string = 'sqs', endpoint: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const request =
            {
                Endpoint: endpoint,
                Protocol: protocol,      /* required */
                TopicArn: topicInfo.Arn, /* required */
            };

            this.InternalClient.subscribe(request, (err, resp) => {
                if (err) {
                    this.Logger.error(err);
                    reject(err);
                }
                else {
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
    public unsubscribe(subscription: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.InternalClient.unsubscribe({ SubscriptionArn: subscription }, (err, resp) => {
                if (err) {
                    this.Logger.error(err);
                    reject(err);
                }
                else {
                    resolve(true);
                    this.EventPublisher.emit('Topic.Unsubscribed', subscription);
                }
            });
        });
    }

    private testEventPublisher(): void {
        this.EventPublisher.emit('Topic.Created', 'foo.baz');
        this.EventPublisher.emit('Topic.Deleted', 'foo.baz');
    }
}

// singleton
export class SNSResourceWatcher extends AWSResourceWatcher {
    private static instance: SNSResourceWatcher;

    public static Instance(client: SNSClient): SNSResourceWatcher {
        if (SNSResourceWatcher.instance == null) {
            SNSResourceWatcher.instance = new SNSResourceWatcher(client);
        }
        return SNSResourceWatcher.instance;
    }
}
