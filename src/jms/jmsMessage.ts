import { SQS } from 'aws-sdk';
import * as uuid from 'uuid';

export interface IJmsMessage
{
    CorrelationID: string;
    Destination: string;
    Expiration: number;
    Message: string;
    ReplyTo: string;
    ResponseFormat: string;
    Timestamp: number;
    Type: string;
}

export class JmsMessage implements IJmsMessage
{
    public CorrelationID: string;
    public Destination: string;
    public Expiration: number;
    public Message: string;
    public ReplyTo: string;
    public ResponseFormat: string;
    public Timestamp: number;
    public Type: string;

    constructor(body: string, destination?: string, replyTo?: string, correlationId?: string)
    {
      this.CorrelationID = correlationId || `${uuid.v1()}`;
      this.Expiration = 30 * 1000;
      this.ResponseFormat = 'json';
      this.Timestamp = Date.now();
      this.Type = 'json';

      this.Message = body;
      this.Destination = destination;
      this.ReplyTo = replyTo;
    }

    public static fromAWS(msg: SQS.Message)
    {
      if (msg && msg.Body)
      {
        const obj = JSON.parse(msg.Body);
        const jmsMessage = new JmsMessage(obj.Message, obj.Destination, obj.ReplyTo, obj.CorrelationID);
        return jmsMessage;
      }

      return new JmsMessage(null);
    }

    public toJson(): string
    {
      return JSON.stringify(this);
    }
}
