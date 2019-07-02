import { CloudWatch } from "aws-sdk";
import { DeleteAlarmsInput, DescribeAlarmsInput, SetAlarmStateInput } from "aws-sdk/clients/cloudwatch";
import express = require("express");
import { AppContext } from "../appContext";
import { AWSResourceInfoBase } from "../awsResourceInfoBase";
import { AWSResourceWatcher } from "../awsResourceWatcher";
import { IServiceCreationArgs } from "../services/serviceCreationArgs";
import { AWSServiceClient } from "./awsServiceClient";
import { SNSTopicInfo, SNSClient } from "./snsClient";
import { SQSQueueInfo, SQSClient } from "./sqsClient";

/**
 * CloudwatchAlarmInfo
 *
 * @export
 * @class CloudwatchAlarmInfo
 */
export class CloudwatchAlarmInfo extends AWSResourceInfoBase {
    constructor(name: string, arn: string, attributes: any = {}) {
        super("CloudwatchAlarm", name, arn, attributes);

        this.toString = () => `CloudwatchAlarmInfo: name=${this.Name}, Arn=${this.Arn}`;
    }
}

export enum AlarmState {
    Off = "OK",
    On = "ALARM",
}

/**
 * CloudwatchClient
 *
 * @export
 * @class CloudwatchClient
 * @extends {AWSServiceClient}
 */
export class CloudwatchClient extends AWSServiceClient {
    public static CWAlarmMap: any;
    public static ResourceWatcher: CWResourceWatcher;

    private InternalClient: CloudWatch;

    constructor(args: IServiceCreationArgs) {
        args.Name = 'CloudWatch';
        super(args);

        this.InternalClient = this.createClient();

        this.initAlarmMap(undefined);
    }

    private initAlarmMap(attrs?: any) {
        if (!CloudwatchClient.CWAlarmMap) {
            CloudwatchClient.CWAlarmMap = {};

            if (!attrs || !attrs.noPreloadInfo) {
                this.getAllInfo()
                    .then((alarmMap) => this.swapInfoMap(alarmMap))
                    .catch((err) => this.Logger.error(err));
            }

            CloudwatchClient.ResourceWatcher = CWResourceWatcher.Instance(this);
        }
    }

    private createClient(): CloudWatch {
        if (AppContext.IsMocking) {
            return new CloudWatch();
        }
        else {
            return new CloudWatch({ region: this.AWSClient.Configuration.cloudwatch.region, apiVersion: '2012-11-05' });
        }
    }

    public getServiceConfiguration(): any {
        return super.getServiceConfiguration().cloudwatch;
    }

    public createApi(router: express.Router): void {
        super.createApi(router);

        const entity = 'alarm';

        // Get the urls of all alarms
        router.route(`/${entity}`).get((_, resp) => {
            this.listCloudwatchAlarms()
                .then((alarms) => {
                    const alarmArns = [];
                    // tslint:disable-next-line:forin
                    for (const alarm in CloudwatchClient.CWAlarmMap) {
                        const info: CloudwatchAlarmInfo = CloudwatchClient.CWAlarmMap[alarm];
                        alarmArns.push({ Arn: info.Arn });
                    }
                    resp.status(200).json({ Alarms: alarmArns });
                })
                .catch((err) => {
                    resp.status(400).json({ error: err });
                });
        });

        // Get the info of all alarms
        router.route(`/${entity}/info`).get((_, resp) => {
            this.getAllInfo()
                .then((alarms) => { resp.status(200).json(alarms); })
                .catch((err) => { resp.status(400).json({ error: err }); });
        });

        // Create an alarm for a queue and a metric
        router.route(`/${entity}/create`).post((req, resp) => {
            this.createAlarmForQueue(req, resp);
        });

        // Get info about an alarm
        router.route(`/${entity}/:alarmName`)
            .get((req, resp) => {
                this.listCloudwatchAlarms(req.params.alarmName)
                    .then((result) => resp.status(200).json(result.MetricAlarms[0]))
                    .catch((err) => resp.status(400).json({ error: err }));
            })
            // Delete an alarm
            .delete((req, resp) => {
                this.deleteAlarm(req.params.alarmName)
                    .then((result) => resp.status(200).json({ status: result }))
                    .catch((err) => resp.status(400).json({ error: err }));
            });

        // Set the alarm for testing
        router.route(`/${entity}/:alarmName/set`).put((req, resp) => {
            this.setAlarmState(req.params.alarmName, req.body.state, req.body.reason)
                .then((result) => resp.status(200).json({ status: result }))
                .catch((err) => resp.status(500).json({ error: err }));
        });
    }

    public swapInfoMap(newMap: {}, fireChangeEvent: boolean = false): void {
        CloudwatchClient.CWAlarmMap = newMap;
        super.swapInfoMap(newMap, fireChangeEvent);
    }

    public getCurrentInfoMap(): {} {
        return CloudwatchClient.CWAlarmMap;
    }

    /**
     * getAllInfo
     *
     * @returns {Promise<any>}
     * @memberof CloudwatchClient
     */
    public async getAllInfo(): Promise<{}> {
        const listOfAlarms = await this.listCloudwatchAlarms();

        return new Promise((resolve) => {
            const map = {};

            for (const alarm of listOfAlarms.MetricAlarms) {
                const arn: string = alarm.AlarmArn;
                const alarmName: string = this.extractNameFromArn(arn);
                map[alarmName] = new CloudwatchAlarmInfo(alarmName, arn, alarm);
            }

            resolve(map);
        });
    }

    public listCloudwatchAlarms(alarmName: string = null): Promise<CloudWatch.DescribeAlarmsOutput> {
        const params: DescribeAlarmsInput = {};
        if (alarmName) {
            params.AlarmNames = [alarmName];
        }

        return new Promise((resolve, reject) => {
            this.InternalClient.describeAlarms(params, (err, result) => {
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

    public createAlarm(
        resourceInfo: AWSResourceInfoBase,
        metricName: string,
        period: number,
        evalPeriod: number,
        threshold: number,
        targetArn: string,
    ): Promise<CloudwatchAlarmInfo> {
        let dimensionName: string = '';
        let namespace = 'AWS/';

        if (resourceInfo instanceof SQSQueueInfo) {
            dimensionName = 'QueueName';
            namespace += 'SQS';
        }
        else if (resourceInfo instanceof SNSTopicInfo) {
            dimensionName = 'TopicName';
            namespace += 'SNS';
        }

        const alarmName = `${resourceInfo.Name}${metricName}Alarm`;
        const dimensionValue = resourceInfo.Name;

        return this.createAlarm2(alarmName, namespace, metricName, period, evalPeriod, threshold, targetArn, dimensionName, dimensionValue);
    }

    public createAlarm2(
        alarmName: string,
        namespace: string,
        metricName: string,
        period: number,
        evalPeriod: number,
        threshold: number,
        targetArn: string,
        dimensionName: string,
        dimensionValue: string,
    ): Promise<CloudwatchAlarmInfo> {
        /*
          aws cloudwatch put-metric-alarm --alarm-name MarcQueueSentAlarm
                                          --namespace AWS/SQS
                                          --metric-name NumberOfMessagesReceived
                                          --period 60
                                          --evaluation-periods 5
                                          --threshold 1
                                          --comparison-operator GreaterThanOrEqualToThreshold
                                          --statistic Sum
                                          --treat-missing-data missing
                                          --alarm-actions arn:aws:sns:us-west-2:901643335044:MarcQueueAlarmNotificationTopic
                                          --dimensions "Name=QueueName,Value=marcsQueue"
        */
        return new Promise((resolve, reject) => {
            const params: CloudWatch.PutMetricAlarmInput =
            {
                AlarmActions: [targetArn],
                AlarmName: alarmName,
                ComparisonOperator: 'GreaterThanOrEqualToThreshold',
                Dimensions: [{ Name: dimensionName, Value: dimensionValue }],
                EvaluationPeriods: evalPeriod,
                MetricName: metricName,
                Namespace: namespace,
                Period: period,
                Statistic: 'Sum',
                Threshold: threshold,
                TreatMissingData: 'missing',
            };

            this.InternalClient.putMetricAlarm(params, (err) => {
                if (err) {
                    this.Logger.error(err);
                    reject(err);
                }
                else {
                    const describeAlarmsParams: DescribeAlarmsInput =
                    {
                        AlarmNames: [alarmName],
                    };
                    this.InternalClient.describeAlarms(describeAlarmsParams, (errDescribe, data) => {
                        if (errDescribe) {
                            this.Logger.error(errDescribe);
                            reject(errDescribe);
                        }
                        else {
                            const alarmInfo: CloudwatchAlarmInfo = new CloudwatchAlarmInfo(alarmName, data.MetricAlarms[0].AlarmArn);
                            CloudwatchClient.CWAlarmMap[alarmName] = alarmInfo;
                            resolve(alarmInfo);
                        }
                    });
                }
            });
        });
    }

    public deleteAlarm(alarmName: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const params: DeleteAlarmsInput =
            {
                AlarmNames: [alarmName],
            };

            this.InternalClient.deleteAlarms(params, (err) => {
                if (err) {
                    this.Logger.error(err);
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });
        });
    }

    public setAlarmState(alarmName: string, state: AlarmState, reason: string, jsonReasonData?: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const params: SetAlarmStateInput =
            {
                AlarmName: alarmName,
                StateReason: reason,
                StateReasonData: jsonReasonData || '{}',
                StateValue: state,
            };

            this.InternalClient.setAlarmState(params, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });
        });
    }

    //#region Cloudwatch Workflow
    private createAlarmForQueue(req, resp) {
        const queueName: string = req.body.queue;
        const metricName: string = req.body.metric;
        const period: number = req.body.period || 1;
        const evalPeriod: number = req.body.evalPeriod || 1;
        const threshold: number = req.body.threshold || 1;
        const topicName: string = req.body.topic;

        const sqsClient: SQSClient = this.Manager.getService<SQSClient>('SQS');
        const snsClient: SNSClient = this.Manager.getService<SNSClient>('SNS');

        // We need to validate that the queue exists. If not, return an error.
        sqsClient.getQueueInfo(queueName, false)
            // Get the topic to send the notification to. If the topic doesn't exist, create it.
            .then(() => snsClient.getTopicInfo(topicName, true).then((topicInfo) => topicInfo))
            // Create any subscriptions that are needed
            // NOTE - should these subscriptions be deleted when the alarm is deleted?
            .then((topicInfo) => {
                this.subscribe(topicInfo, "email", req.body.notifications.emails)
                    .subscribe(topicInfo, "sqs", req.body.notifications.queues)
                    .subscribe(topicInfo, "sms", req.body.notifications.sms)
                    .subscribe(topicInfo, "lambda", req.body.notifications.lambdas)
                    .subscribe(topicInfo, "http", req.body.notifications.http)
                    .subscribe(topicInfo, "https", req.body.notifications.https)
                    ;
                return topicInfo;
            })
            // Create the Cloudwatch alarm for the queue.
            .then((topicInfo) => {
                return this.createAlarm(new SQSQueueInfo(queueName, null, null), metricName, period, evalPeriod, threshold, topicInfo.Arn);
            })
            // Finish up. Publish an internal event, and respond to the REST request
            .then((alarmInfo) => {
                this.EventPublisher.emit("Alarm.Created", req.body);
                resp.status(201).json(alarmInfo);
            })
            .catch((err) => {
                this.Logger.error(err);
                resp.sendStatus(400).json({ error: err });
            });
    }

    private subscribe(topicInfo: SNSTopicInfo, protocol: string, targets: string[]): CloudwatchClient {
        if (targets) {
            const snsClient: SNSClient = this.Manager.getService<SNSClient>('SNS');
            for (const target of targets) {
                snsClient.subscribe(topicInfo, protocol, target);
            }
        }
        return this;
    }

}

// singleton
export class CWResourceWatcher extends AWSResourceWatcher {
    private static instance: CWResourceWatcher;

    public static Instance(client: CloudwatchClient): CWResourceWatcher {
        if (CWResourceWatcher.instance == null) {
            CWResourceWatcher.instance = new CWResourceWatcher(client);
        }
        return CWResourceWatcher.instance;
    }
}
