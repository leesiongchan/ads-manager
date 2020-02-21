import { Channel } from './channels';

interface AdsManagerConfig<T extends Channel> {
  channels: T[];
}

export class AdsManager<T extends Channel> {
  private channels: T[] = [];

  constructor(readonly config: AdsManagerConfig<T>) {
    this.channels = config.channels;
  }

  public addChannel(channel: T) {
    this.channels.push(channel);
  }

  public use<U extends T>(channelId: string): U | undefined {
    return this.channels.find(channel => channel.getId() === channelId) as U;
  }
}

export default AdsManager;
