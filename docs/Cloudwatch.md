# Cloudwatch APIs

## Alarms

* Get
  * DescribeAlarms(string? actionPrefix, string? alarmPrefix, string[]? alarmNames, string? state)
  * DescribeAlarmsForMetric()

* Create
  * PutMetricAlarm()

* Update
  * DisableAlarmActions(string[] alarmNames)
  * EnableAlarmActions(string[] alarmNames)
  * SetAlarmState(string alarmName, string reason, string? jsonReasonData, string state)

* Delete
  * DeleteAlarms(string[] alarmNames)

## Setting a Cloudwatch Alarm Manually

Make sure that the aws-cli is installed on your system. Open a terminal and run the following command:

    aws cloudwatch set-alarm-state --alarm-name MarcQueueSentAlarm --state-value ALARM --state-reason testing

## Flow of Setting up an Alarm for a Queue

* Given the name of a queue, create a SNS Topic with the corresponding name
* Create a new subscription for the SNS Topic where email is sent to a user
  * There is a step where the user needs to confirm the subscription
* Create the Cloudwatch Alarm
  * The name of the alarm is derived from the Queue name

aws cloudwatch put-metric-alarm --alarm-name MarcQueueSentAlarm --namespace AWS/SQS --metric-name NumberOfMessagesReceived --period 60 --evaluation-periods 5 --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold --statistic Sum --treat-missing-data missing --alarm-actions arn:aws:sns:us-west-2:901643335044:MarcQueueAlarmNotificationTopic --dimensions "Name=QueueName,Value=marcsQueue"