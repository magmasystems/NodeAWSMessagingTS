import { EventEmitter2 } from "eventemitter2";

export class AWSServiceEventPublisher extends EventEmitter2
{
  public Name: string;
  public static Prefix: string = 'AWS.';

  constructor(name: string)
  {
      super({ wildcard: true });
      this.Name = name;
  }

  public emit(event: string | string[], ...values: any[]): boolean
  {
      let eventSubject = event as string;
      if (!eventSubject.startsWith(AWSServiceEventPublisher.Prefix))
      {
        eventSubject = AWSServiceEventPublisher.Prefix + (event as string);
      }

      return super.emit(eventSubject, values);
  }
}
