import { Channel } from './channels';

interface AdsManagerConfig {
  channels: Channel[];
}

export class AdsManager {
  private channels: Channel[] = [];

  constructor(readonly config: AdsManagerConfig) {
    this.channels = config.channels;
  }

  public addChannel(channel: Channel) {
    this.channels.push(channel);
  }

  public use(channelId: string) {
    return this.channels.find(channel => channel.getId() === channelId);
  }
}

export default AdsManager;
