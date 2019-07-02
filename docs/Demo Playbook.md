# Demo of AWS Messaging

1. Show API through Postman

1. Show API on Swagger
   * <http://localhost:3000/api-docs>

1. Bring up Chrome with the SQS and SNS dashboards. From Postman, do the following:
   * Show the two different ways of authentication (ini and federated)
     * Use the ini method
   * In the config file, make sure that the proxyIgnore option is false
   * Mention the Info Watcher
   * Run through these items
     * Create a queue
     * Create a topic
     * Show a list of queues and queue info
     * Show a list of topics and topic info
     * Show info about the queue we just created
     * Show info about the topic we just created
     * Publish a message to the queue
     * Publish a message to the topic
     * Subscribe a topic to a queue
     * Publish a message to the topic and show that it is in the queue
     * Receive a message in the queue
     * Delete the subscription
     * Delete the topic
     * Delete the queue
