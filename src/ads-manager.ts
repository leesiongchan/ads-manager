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
    this.channels.forEach(channel => {
      channel.setLogger(this.logger);
    });
  }

  public addChannel(channel: T) {
    channel.setLogger(this.logger);
    this.channels.push(channel);
  }

  public use<U extends T>(channelId: string): U | undefined {
    return this.channels.find(channel => channel.getId() === channelId) as U;
  }
}

export default AdsManager;
