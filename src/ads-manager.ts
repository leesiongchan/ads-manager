import * as Pino from 'pino';

import { Channel } from './channels';

const pino = Pino;

interface AdsManagerConfig<T extends Channel> {
  channels: T[];
  logging?: boolean;
}

export class AdsManager<T extends Channel> {
  private channels: T[] = [];
  private readonly logger: Pino.Logger;

  constructor(readonly config: AdsManagerConfig<T>) {
    this.logger = pino({
      enabled: config.logging,
      prettyPrint: { colorize: true },
    });
    this.channels = config.channels;
  }

  public addChannel(channel: T) {
    this.channels.push(channel);
  }

  public use<U extends T>(channelId: string): U | undefined {
    const channel = this.channels.find(c => c.getId() === channelId) as U;
    channel.setLogger(this.logger);
    return channel;
  }
}

export default AdsManager;
