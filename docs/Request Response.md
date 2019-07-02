# Implementing Request/Response

* Queue for sending the message
* Queue for receiving responses
* Message needs correlation id, format desired, name of the queue to send the response to, timeout in seconds (-1 for no timeout), sync or async
* SQS Client has to Receive() from the receive queue
* SQS Client needs a callback when the message is received

queueSend    = this.SQSClient.createQueue("MyQueue");
queueReceive = this.SQSClient.createQueue("MyResponseQueue");
