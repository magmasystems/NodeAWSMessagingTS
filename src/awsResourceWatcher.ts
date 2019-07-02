import { AWSServiceClient } from "./aws/awsServiceClient";
import { IDisposable } from "./framework/using";

export /* singleton */ abstract class AWSResourceWatcher implements IDisposable
{
  protected TheClient: AWSServiceClient;
  protected Timer: NodeJS.Timer;

  protected constructor(client: AWSServiceClient)
  {
      this.TheClient = client;

      const seconds = client.getServiceConfiguration().infoWatcherInterval || 30;
      const interval = seconds * 1000;

      // You can disable a watcher by setting it's interval to -1
      if (interval <= 0)
      {
          return;
      }

      // Every few seconds, grab the current info from all queues in SQS
      this.Timer = setInterval((...args) =>
      {
          this.TheClient.getAllInfo().then((infos) =>
          {
              if (!this.compareMaps(this.TheClient.getCurrentInfoMap(), infos))
              {
                  this.TheClient.swapInfoMap(infos, true);
              }
          });
      },
      interval);
  }

  /**
   * compareMaps - sees if two maps are equal
   *
   * @protected
   * @param {any} map1
   * @param {any} map2
   * @returns {boolean} - true if equal, false if not
   * @memberof AWSServiceClient
   */
  public compareMaps(map1: {}, map2: {}): boolean
  {
    for (const prop in map1)
    {
      if (map1.hasOwnProperty(prop) && !map2.hasOwnProperty(prop))
      {
        return false;
      }
    }

    for (const prop2 in map2)
    {
      if (map2.hasOwnProperty(prop2) && !map1.hasOwnProperty(prop2))
      {
        return false;
      }
    }

    return true;
  }

  public dispose(): void
  {
      if (this.Timer)
      {
          clearInterval(this.Timer);
          this.Timer = null;
      }
  }
}
