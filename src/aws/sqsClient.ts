'use strict';

/// <reference types="aws-sdk" />
import * as AWS from 'aws-sdk';
import * as SQS from 'aws-sdk/clients/sqs';
import { Message } from 'aws-sdk/clients/sqs';
import { clearInterval, setInterval } from 'timers';
import { AppContext } from '../appContext';
import { AWSResourceInfoBase } from '../awsResourceInfoBase';
import { AWSResourceWatcher } from '../awsResourceWatcher';
import { AWSServiceClient } from './awsServiceClient';

import * as AWSMock from 'aws-sdk-mock';
import { AWSError } from 'aws-sdk/lib/error';
import { AWSMessagingApiManager } from '../awsMessagingApiManager';
import { AWSMessagingServerSettings, IAWSMessagingServerSettings } from '../awsMessagingServerSettings';
import { IServiceCreationArgs } from '../services/serviceCreationArgs';

export type MessageReceivedCallback = (msg: SQS.Message) => void;
export type NoMessageReceivedCallback = () => void;
export type ErrorReceivedCallback = (err: AWSError) => void;

/**
 * SQSQueueInfo
 *
 * @export
 * @class SQSQueueInfo
 */
export class SQSQueueInfo extends AWSResourceInfoBase
{
    constructor(name: string, url?: string, arn?: string, attributes: any = {})
    {
        super("Queue", name, arn, attributes);
        this.Url = url;

        this.toString = () => `SQSQueueInfo: name=${this.Name}, Url=${this.Url}, Arn=${this.Arn}`;
    }
}

/**
 *
 *
 * @export
 * @class SQSClient
 * @extends {AWSServiceClient}
 */
export class SQSClient extends AWSServiceClient
{
    public static QueueMap: {};
    public static ResourceWatcher: SQSResourceWatcher;

    private InternalClient: SQS;
    private DeleteMessageAfterConsuming: boolean;

    constructor(args: IServiceCreationArgs)
    {
        super('SQS', args.Name, args.Settings);

        this.DeleteMessageAfterConsuming = this.AWSClient.Configuration.sqs.deleteMessageAfterConsuming || true;

        // The mocking should be done before the actual AWS service is created

        this.InternalClient = this.createClient();
        this.initQueueMap(undefined);
    }

    private constructor2(name: string = 'SQS Client', attrs?: any, settings?: IAWSMessagingServerSettings)
    {
        // super('SQS', name, settings);

        this.DeleteMessageAfterConsuming = this.AWSClient.Configuration.sqs.deleteMessageAfterConsuming || true;

        // The mocking should be done before the actual AWS service is created

        this.InternalClient = this.createClient();
        this.initQueueMap(attrs);
    }

    private initQueueMap(attrs?: any)
    {
        if (!SQSClient.QueueMap)
        {
            SQSClient.QueueMap = {};

            if (!attrs || !attrs.noPreloadInfo)
            {
                this.getAllInfo()
                    .then((queueMap) => this.swapInfoMap(queueMap))
                    .catch((err) => this.Logger.error(err));
            }

            SQSClient.ResourceWatcher = SQSResourceWatcher.Instance(this);
        }
    }

    private createClient(): SQS
    {
        if (AppContext.IsMocking)
        {
            return new AWS.SQS();
        }
        else
        {
            return new SQS({ region: this.AWSClient.Configuration.sqs.region, apiVersion: '2012-11-05' });
        }
    }

    private sleep(ms): Promise<number>
    {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    public getServiceConfiguration(): any
    {
        return super.getServiceConfiguration().sqs;
    }

    private deleteClient(): void
    {
        // There doesn't seem to be a dispose() function for the SQS class
    }

    /**
     * getAllInfo
     *
     * @returns {Promise<any>}
     * @memberof SQSClient
     */
    public async getAllInfo(): Promise<{}>
    {
        const listOfQueues = await this.listQueues();

        return new Promise((resolve, reject) =>
        {
            if (!listOfQueues || !listOfQueues.QueueUrls)
            {
                resolve(null);
                return;
            }

            const promises = [];
            const queueMap = {};

            // tslint:disable-next-line:prefer-for-of
            for (let i = 0;  i <  listOfQueues.QueueUrls.length;  i++)
            {
                const url: string = listOfQueues.QueueUrls[i];
                promises.push(this.InternalClient.getQueueAttributes( { QueueUrl: url, AttributeNames: [ "All" ] }, (err, result) =>
                {
                    if (err)
                    {
                        this.Logger.error(err);
                    }
                    else
                    {
                        const arn: string = result.Attributes.QueueArn;
                        const queueName: string = this.extractNameFromArn(arn);
                        queueMap[queueName] = new SQSQueueInfo(queueName, url, arn, result.Attributes);
                    }
                }).promise());
            }

            // Wait for all of the queue attribute requests to be completed.
            // Then set the global QueueMap.
            Promise.all(promises)
                .then((q) =>
                {
                    resolve(queueMap);
                })
                .catch((err) => this.Logger.error(err));
        });
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
     * @memberof SQSClient
     */
    public swapInfoMap(newMap: {}, fireChangeEvent: boolean = false)
    {
        if (newMap)
        {
            SQSClient.QueueMap = newMap;
            super.swapInfoMap(newMap, fireChangeEvent);
        }
    }

    public getCurrentInfoMap(): {}
    {
        return SQSClient.QueueMap;
    }

    /**
     * createQueues
     *
     * @param {string[]} queueNames
     * @returns {Array<Promise<SQSQueueInfo>>}
     * @memberof SQSClient
     */
    public createQueues(queueNames: string[]): Array<Promise<SQSQueueInfo>>
    {
        const promises: Array<Promise<SQSQueueInfo>> = [];

        for (const queueName of queueNames)
        {
            promises.push(this.createQueue(queueName));
        }

        return promises;
    }

    /**
     * createQueue
     *
     * @param {string} queueName
     * @param {*} [attrs=null]
     * @param {boolean} [allowQueueToReceiveMessages=true]
     * @returns {Promise<SQSQueueInfo>}
     * @memberof SQSClient
     */
    public createQueue(queueName: string, attrs: any = {}, allowQueueToReceiveMessages: boolean = true): Promise<SQSQueueInfo>
    {
        // If we created the queue already, then just return this queue
        if (SQSClient.QueueMap[queueName] !== undefined)
        {
            return new Promise((resolve, _) => resolve(SQSClient.QueueMap[queueName]));
        }

        // If we haven't explicitly passed in some attributes, then look for them in the config file
        const config = this.AWSClient.Configuration.sqs;
        if (!attrs.MessageRetentionPeriod)
        {
            attrs.MessageRetentionPeriod = (config.messageRetentionPeriod || 120).toString();
        }
        if (!attrs.ReceiveMessageWaitTimeSeconds)
        {
            attrs.ReceiveMessageWaitTimeSeconds = (config.receiveWaitSeconds || 10).toString();
        }

        const createQueueRequest =
        {
            Attributes: {},
            QueueName: queueName,
        };

        // Add any attributes that were passed in
        // tslint:disable-next-line:forin
        for (const key in attrs)
        {
            if (key !== "Name")
            {
                let val = attrs[key];
                if (typeof val === 'number')
                {
                    val = val.toString();
                }
                createQueueRequest.Attributes[key] = val;
            }
        }

        return new Promise((resolve, reject) =>
        {
            this.InternalClient.createQueue(createQueueRequest, (err, queueResp) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    const queueAttributesRequest =
                    {
                        AttributeNames: [ 'All' ],
                        QueueUrl: queueResp.QueueUrl,
                    };
                    this.InternalClient.getQueueAttributes(queueAttributesRequest, (err2, result) =>
                    {
                        // tslint:disable-next-line:max-line-length
                        const queueInfo = new SQSQueueInfo(queueName, queueResp.QueueUrl, result.Attributes.QueueArn, result.Attributes);
                        SQSClient.QueueMap[queueName] = queueInfo;

                        // We need to tell AWS that the queue should be allowed to receive messages
                        if (allowQueueToReceiveMessages)
                        {
                            this.sqsAllowQueueToReceiveMessages(queueInfo)
                                .then(() =>
                                {
                                    this.Logger.info(`The queue was created: ${queueInfo}`);
                                    resolve(queueInfo);
                                    this.EventPublisher.emit('Queue.Created', queueInfo.Name);
                                });
                        }
                        else
                        {
                            this.Logger.info(`The queue was created: ${queueInfo}`);
                            resolve(queueInfo);
                            this.EventPublisher.emit('Queue.Created', queueInfo.Name);
                        }
                    });
                }
            });
        });
    }

    /* private */
    private sqsAllowQueueToReceiveMessages(queueInfo: SQSQueueInfo): Promise<{}>
    {
        let attr = `{
          "Version": "2012-10-17",
          "Id": "{queueArn}/SQSDefaultPolicy",
          "Statement":
           [{
             "Sid":       "Sid1494310941284",
             "Effect":    "Allow",
             "Principal": "*",
             "Action":    "SQS:SendMessage",
             "Resource":  "{queueArn}"
           }]
        }`;

        attr = attr.replace(/{queueArn}/g, queueInfo.Arn);

        return new Promise((resolve, reject) =>
        {
            this.InternalClient.setQueueAttributes(
                {
                    Attributes: { Policy: attr },
                    QueueUrl: queueInfo.Url,
                },
                (err, result) =>
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
                },
            );
        });
    }

    /**
     * getQueueInfo
     *
     * @param {string} queueName
     * @param {boolean} [createQueueIfNoExist=true]
     * @returns {Promise<SQSQueueInfo>}
     * @memberof SQSClient
     */
    public getQueueInfo(queueName: string, createQueueIfNoExist: boolean = true): Promise<SQSQueueInfo>
    {
        if (SQSClient.QueueMap[queueName] !== undefined)
        {
            return new Promise((resolve, _) => resolve(SQSClient.QueueMap[queueName]));
        }

        if (!createQueueIfNoExist)
        {
            return new Promise((resolve, _) => resolve(null));
        }

        return new Promise((resolve, reject) =>
        {
            let queueInfo = null;

            this.createQueue(queueName)
                .then(() =>
                {
                    queueInfo = SQSClient.QueueMap[queueName];
                    if (queueInfo == null) {
                        reject(null);
                    }
                    else {
                        resolve(queueInfo);
                    }
                });
        });
    }

    /**
     * listQueues - returns a list of strings, each one is a URL of a SQS Queue
     *
     * @param {string} [prefix=null] - optional prefix of the queue name. All queues with that prefix will be returned.
     * @returns {Promise<SQS.ListQueuesResult>} a list of strings, each one is a URL of a SQS Queue
     * @memberof SQSClient
     */
    public listQueues(prefix: string = null): Promise<SQS.ListQueuesResult>
    {
        const params = (prefix) ? { QueueNamePrefix: prefix } : {};

        return new Promise((resolve, reject) =>
        {
            this.InternalClient.listQueues(params, (err, result) =>
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
     * deleteQueue
     *
     * @param {SQSQueueInfo} queueInfo
     * @returns {Promise<{}>}
     * @memberof SQSClient
     */
    public deleteQueue(queueInfo: SQSQueueInfo): Promise<boolean>
    {
        return new Promise((resolve, reject) =>
        {
            const queueInfo2 = SQSClient.QueueMap[queueInfo.Name];
            if (!queueInfo2 || !queueInfo2.Name)
            {
                const errMsg = `There is no queue named ${queueInfo.Name}`;
                this.Logger.error(errMsg);
                reject(errMsg);
                return;
            }

            this.InternalClient.deleteQueue({ QueueUrl: queueInfo2.Url }, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    delete SQSClient.QueueMap[queueInfo2.Name];
                    this.Logger.info(`The queue ${queueInfo2.Name} was deleted`);
                    resolve(true);
                    this.EventPublisher.emit('Queue.Deleted', queueInfo.Name);
                }
            });
        });
    }

    /**
     * purgeQueue
     *
     * @param {SQSQueueInfo} queueInfo
     * @returns {Promise<{}>}
     * @memberof SQSClient
     */
    public purgeQueue(queueInfo: SQSQueueInfo): Promise<{}>
    {
        return new Promise((resolve, reject) =>
        {
            const queueInfo2 = SQSClient.QueueMap[queueInfo.Name];
            if (!queueInfo2)
            {
                reject(`There is no queue named ${queueInfo.Name}`);
                return;
            }

            this.InternalClient.purgeQueue({ QueueUrl: queueInfo.Url }, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    resolve(result);
                    this.EventPublisher.emit('Queue.Purged', queueInfo.Name);
                }
            });
        });
    }

    /**
     * publish
     *
     * @param {SQSQueueInfo} queueInfo
     * @param {string} body
     * @returns {Promise<SQS.SendMessageResult>}
     * @memberof SQSClient
     */
    public publish(queueInfo: SQSQueueInfo, body: string): Promise<SQS.SendMessageResult>
    {
        return new Promise((resolve, reject) =>
        {
            this.InternalClient.sendMessage(
                {
                    MessageBody: body,
                    QueueUrl: queueInfo.Url,
                },
                (err, result) =>
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
     *
     *
     * @param {SQSQueueInfo} queueInfo
     * @param {{}} attrs
     * @param {MessageReceivedCallback} [onMsgReceived=null]
     * @param {NoMessageReceivedCallback} [onNoMsgReceived=null]
     * @memberof SQSClient
     */
    public receiveMessage(queueInfo: SQSQueueInfo,
                          attrs: {} = null,
                          onMsgReceived: MessageReceivedCallback = null,
                          onNoMsgReceived: NoMessageReceivedCallback = null,
                          onError: ErrorReceivedCallback = null): void
    {
        /*
            var params =
            {
                QueueUrl: 'STRING_VALUE', // required
                AttributeNames: [
                    All | Policy | VisibilityTimeout | MaximumMessageSize | MessageRetentionPeriod |
                    ApproximateNumberOfMessages | ApproximateNumberOfMessagesNotVisible | CreatedTimestamp |
                    LastModifiedTimestamp | QueueArn | ApproximateNumberOfMessagesDelayed | DelaySeconds | ReceiveMessageWaitTimeSeconds |
                    RedrivePolicy | FifoQueue | ContentBasedDeduplication | KmsMasterKeyId | KmsDataKeyReusePeriodSeconds,
                    // more items
                ],
                MaxNumberOfMessages: 0,
                MessageAttributeNames: [
                    'STRING_VALUE',
                    // more items
                ],
                ReceiveRequestAttemptId: 'STRING_VALUE',
                VisibilityTimeout: 0,
                WaitTimeSeconds: 0
            };
        */

        const request: SQS.ReceiveMessageRequest =
        {
            QueueUrl: queueInfo.Url,
        };

        if (attrs == null)
        {
            attrs = this.AWSClient.Configuration.sqs.receiveAttributes;
        }

        // tslint:disable-next-line:forin
        for (const attr in attrs)
        {
            switch (attr.toLowerCase())
            {
                case "maxnumberofmessages":
                    request.MaxNumberOfMessages = parseInt(attrs[attr], 10);
                    break;
                case "visibilitytimeout":
                    request.VisibilityTimeout = parseInt(attrs[attr], 10);
                    break;
                case "waittime":
                case "waittimeseconds":
                    request.WaitTimeSeconds = parseInt(attrs[attr], 10);
                    break;
                default:
                    break;
            }
        }

        this.InternalClient.receiveMessage(request, (err, result) =>
        {
            if (!result)
            {
                if (err)
                {
                    this.Logger.error(err);
                    if (onError)
                    {
                        onError(err);
                        return;
                    }
                }
                if (onNoMsgReceived)
                {
                    onNoMsgReceived();
                }
                return;
            }

            const msgs = result.Messages;
            if (!msgs || msgs.length === 0)
            {
                if (onNoMsgReceived)
                {
                    onNoMsgReceived();
                }
                return;
            }

            // tslint:disable-next-line:prefer-for-of
            for (let i = 0;  i < msgs.length;  i++)
            {
                const msg = msgs[i];
                // Invoke the callback function for each message that was returned
                if (onMsgReceived)
                {
                    onMsgReceived(msg);
                }

                if (this.DeleteMessageAfterConsuming)
                {
                    this.deleteMessage(queueInfo, msg);
                }
            }
        });

        // this.sleep(3 * 1000).then(() => {});
    }

    /**
     *
     *
     * @param {SQSQueueInfo} queueInfo
     * @param {Message} msg
     * @returns {Promise<{}>}
     * @memberof SQSClient
     */
    public deleteMessage(queueInfo: SQSQueueInfo, msg: Message): Promise<{}>
    {
        return new Promise((resolve, reject) =>
        {
            const request: SQS.DeleteMessageRequest =
            {
                QueueUrl: queueInfo.Url,
                ReceiptHandle: msg.ReceiptHandle,
            };

            this.InternalClient.deleteMessage(request, (err, result) =>
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
     * share
     *
     * @param {SQSQueueInfo} queueInfo
     * @param {string} principal
     * @returns {Promise<string>}
     * @memberof SQSClient
     */
    public share(queueInfo: SQSQueueInfo, principal: string): Promise<string>
    {
        return new Promise((resolve, reject) =>
        {
            const request: SQS.AddPermissionRequest =
            {
                AWSAccountIds: [ principal ],
                Actions: ['ReceiveMessage', 'SendMessage'],
                Label: `AddPermission-${queueInfo.Name}-${principal}`,
                QueueUrl: queueInfo.Url,
            };

            this.InternalClient.addPermission(request, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    resolve(request.Label);
                }
            });
        });
    }

    /**
     * unshare
     *
     * @param {SQSQueueInfo} queueInfo
     * @param {string} label
     * @returns {Promise<boolean>}
     * @memberof SQSClient
     */
    public unshare(queueInfo: SQSQueueInfo, label: string): Promise<boolean>
    {
        return new Promise((resolve, reject) =>
        {
            const request: SQS.RemovePermissionRequest =
            {
                Label: label,
                QueueUrl: queueInfo.Url,
            };

            this.InternalClient.removePermission(request, (err, result) =>
            {
                if (err)
                {
                    this.Logger.error(err);
                    reject(err);
                }
                else
                {
                    resolve(true);
                }
            });
        });
    }
}

/* singleton */
export class SQSResourceWatcher extends AWSResourceWatcher
{
    private static instance: SQSResourceWatcher;

    public static Instance(client: SQSClient): SQSResourceWatcher
    {
        if (SQSResourceWatcher.instance == null)
        {
            SQSResourceWatcher.instance = new SQSResourceWatcher(client);
        }
        return SQSResourceWatcher.instance;
    }
}
