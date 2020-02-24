import * as mime from 'mime-types';
import * as path from 'path';
import Fetch from 'cross-fetch';
// @ts-ignore
import Twitter from 'twitter-lite';
import { DeepPartial } from 'ts-essentials';
import { formatISO, parseISO } from 'date-fns';
import { sha256 } from 'js-sha256';

import Channel, { CustomAudienceUserData } from './channel';
import httpClient from '../utils/http-client';
import {
  TwitterCampaignData,
  TwitterCampaignStatus,
  TwitterLineItemData,
  TwitterMediaData,
  TwitterPromotedTweetData,
  TwitterTailoredAudienceData,
  TwitterTargetingCriterionData,
  TwitterTweetData,
} from '../interfaces/twitter-ads';
import { convertMinorToMicroUnit } from '../utils/money-converter';
import { normalizeEmail } from '../utils/normalizer';

type TwitterAdsDefaultData = DeepPartial<Omit<TwitterAdsCampaignData, 'name' | 'status'>>;

interface TwitterAdsChannelConfig {
  accessTokenKey: string;
  accessTokenSecret: string;
  adAccountId: string;
  consumerKey: string;
  consumerSecret: string;
}

interface TwitterAdsCampaignData {
  campaign: Omit<TwitterCampaignData, 'name' | 'status'>;
  lineItem: Omit<TwitterLineItemData, 'campaignId' | 'name' | 'status'>;
  name: string;
  status: TwitterCampaignStatus;
  //   tailoredAudience?: TwitterTailoredAudienceData;
  tailoredAudienceId: string;
  tweet?: TwitterAdsTweetData;
  tweetId?: string;
}

interface TwitterAdsTweetData extends Omit<TwitterTweetData, 'mediaKeys'> {
  mediaUrls: string[];
}

interface TwitterAdsTailoredAudienceUserData extends CustomAudienceUserData {
  expiresAt?: string;
}

const ADS_API_SUBDOMAIN = 'ads-api';
const ADS_API_VERSION = '6';
const UPLOAD_API_SUBDOMAIN = 'upload';
const UPLOAD_API_VERSION = '1.1';

export class TwitterAdsChannel extends Channel {
  private apiUrlPrefix!: string;
  private twitterAdsClient: typeof Twitter;

  constructor(readonly id: string, private config: TwitterAdsChannelConfig) {
    super(id);

    this.updateClient();
  }

  public async createAd(data: TwitterAdsTweetData): Promise<any> {
    const mediaKeys = await Promise.all(
      data.mediaUrls.map(async mediaUrl => {
        const media = await this.uploadMedia({ additionalOwnerIds: [data.asUserId], mediaUrl });
        // Adds into `MediaLibrary`
        await this.twitterAdsClient.post(`${this.apiUrlPrefix}/media_library`, {
          file_name: path.basename(mediaUrl),
          media_category: 'TWEET_IMAGE',
          media_key: media.media_key,
        });
        return media.media_key;
      }),
    );
    const tweetResponse = await this.twitterAdsClient.post(
      `${this.apiUrlPrefix}/tweet`,
      this.composeTweetData({
        asUserId: data.asUserId,
        text: data.text,
        mediaKeys,
      }),
    );
    return tweetResponse.data;
  }

  public async createCampaign(data: TwitterAdsCampaignData): Promise<string> {
    if (!data.tweetId && !data.tweet) {
      throw new Error('`tweetId` or `tweet` is not defined');
    }
    if (!(await this.isTailoredAudienceMinimumSizeMatched(data.tailoredAudienceId))) {
      throw new Error('The size of the Tailored Audience is too small');
    }

    // 1. Create a campaign and associate it with the funding instrument.
    const { data: campaign } = await this.twitterAdsClient.post(
      `${this.apiUrlPrefix}/campaigns`,
      this.composeCampaignData({
        ...data.campaign,
        name: `${data.name} - Campaign`,
        status: 'ACTIVE',
      }),
    );

    // 2. Create a line item associated with the campaign.
    const { data: lineItem } = await this.twitterAdsClient.post(
      `${this.apiUrlPrefix}/line_items`,
      this.composeLineItemData({
        ...data.lineItem,
        campaignId: campaign.id,
        name: `${data.name} - Group`,
        status: 'PAUSED',
      }),
    );

    // 3. Create tweet (optional)
    let tweetId = data.tweetId;
    if (data.tweet) {
      const tweet = await this.createAd(data.tweet);
      tweetId = tweet.id;
    }

    // 4. Create promoted tweet associated with the line item.
    await this.twitterAdsClient.post(
      `${this.apiUrlPrefix}/promoted_tweets`,
      this.composePromotedTweetData({
        lineItemId: lineItem.id,
        tweetIds: [tweetId!],
      }),
    );

    // Creating a new tailored audience is pointless since Twitter requires the size of tailored audience to have at least 100
    // 5. Create a tailored audience (optional)
    // let tailoredAudienceId = data.tailoredAudienceId;
    // if (data.tailoredAudience) {
    //   const tailoredAudience = await this.createCustomAudience(data.tailoredAudience);
    //   tailoredAudienceId = tailoredAudience.id;
    // }

    // 6. Create a targeting profile associated with the line item.
    await this.twitterAdsClient.post(
      `${this.apiUrlPrefix}/targeting_criteria`,
      this.composeTargetingCriterionData({
        lineItemId: lineItem.id,
        tailoredAudienceId: data.tailoredAudienceId,
      }),
    );

    // 7. Finally, un-pause the line item.
    await this.twitterAdsClient.put(`${this.apiUrlPrefix}/line_items/${lineItem.id}`, {
      entity_status: data.status || 'ACTIVE',
    });

    return campaign;
  }

  public async createCustomAudience(data: TwitterTailoredAudienceData) {
    const tailoredAudienceResponse = await this.twitterAdsClient.post(`${this.apiUrlPrefix}/tailored_audiences`, {
      name: data.name,
    });
    return tailoredAudienceResponse.data;
  }

  public async createCustomAudienceUsers(customAudienceId: string, data: TwitterAdsTailoredAudienceUserData) {
    const tailoredAudienceUsersResponse = await this.twitterAdsClient.postJSON(
      `${this.apiUrlPrefix}/tailored_audiences/${customAudienceId}/users`,
      [
        {
          operation_type: 'Update',
          params: {
            effective_at: formatISO(new Date()),
            expires_at: data.expiresAt ? formatISO(parseISO(data.expiresAt)) : undefined,
            users: data.users.map(user => ({
              email: [sha256(normalizeEmail(user.email))],
            })),
          },
        },
      ],
    );
    return tailoredAudienceUsersResponse.data;
  }

  public setConfig(config: Partial<TwitterAdsChannelConfig>) {
    Object.assign(this.config, config);
    this.updateClient();
  }

  public setDefaultValues(defaultValues: TwitterAdsDefaultData) {
    this.defaultValues = defaultValues;
  }

  private composeCampaignData(data: TwitterCampaignData) {
    return {
      daily_budget_amount_local_micro: convertMinorToMicroUnit(data.dailyBudget),
      end_time: data.endTime ? formatISO(parseISO(data.endTime)) : undefined,
      entity_status: data.status || 'ACTIVE',
      funding_instrument_id: data.fundingInstrumentId,
      name: data.name,
      start_time: data.startTime ? formatISO(parseISO(data.startTime)) : undefined,
      total_budget_amount_local_micro: convertMinorToMicroUnit(data.totalBudget),
    };
  }

  private composeLineItemData(data: TwitterLineItemData) {
    return {
      bid_amount_local_micro: convertMinorToMicroUnit(data.bidAmount),
      bid_type: 'TARGET',
      campaign_id: data.campaignId,
      entity_status: data.status || 'ACTIVE',
      name: data.name,
      objective: 'AWARENESS',
      placements: ['ALL_ON_TWITTER'],
      product_type: 'PROMOTED_TWEETS',
    };
  }

  private composePromotedTweetData(data: TwitterPromotedTweetData) {
    return {
      line_item_id: data.lineItemId,
      tweet_ids: data.tweetIds,
    };
  }

  private composeTargetingCriterionData(data: TwitterTargetingCriterionData) {
    return {
      line_item_id: data.lineItemId,
      operator_type: 'EQ',
      targeting_type: 'TAILORED_AUDIENCE',
      targeting_value: data.tailoredAudienceId,
    };
  }

  private composeTweetData(data: TwitterTweetData) {
    return {
      as_user_id: data.asUserId,
      media_keys: data.mediaKeys,
      text: data.text,
    };
  }

  private async isTailoredAudienceMinimumSizeMatched(tailoredAudienceId: string) {
    const tailoredAudienceResponse = await this.twitterAdsClient.get(
      `${this.apiUrlPrefix}/tailored_audiences/${tailoredAudienceId}`,
    );
    return !tailoredAudienceResponse.data.reasons_not_targetable.includes('TOO_SMALL');
  }

  private setupClient(config: {
    accessTokenKey: string;
    accessTokenSecret: string;
    consumerKey: string;
    consumerSecret: string;
    subdomain?: string;
    version?: string;
  }) {
    const twitterClient = new Twitter({
      access_token_key: config.accessTokenKey,
      access_token_secret: config.accessTokenSecret,
      consumer_key: config.consumerKey,
      consumer_secret: config.consumerSecret,
      subdomain: config.subdomain || ADS_API_SUBDOMAIN,
      version: config.version || ADS_API_VERSION,
    });
    // Little hack to force JSON request because the official lib doesnt not support
    // Mostly copy from https://github.com/draftbit/twitter-lite/blob/master/twitter.js#L229
    twitterClient.postJSON = (resource: any, body: any) => {
      const { requestData, headers } = this.twitterAdsClient._makeRequest('POST', resource, null);
      const postHeaders = Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, headers);
      body = JSON.stringify(body);
      return Fetch(requestData.url, {
        method: 'POST',
        headers: postHeaders,
        body,
      })
        .then(Twitter._handleResponse)
        .then(results => ('errors' in results ? Promise.reject(results) : results));
    };
    return twitterClient;
  }

  private updateClient() {
    this.twitterAdsClient = this.setupClient(this.config);
    this.apiUrlPrefix = `accounts/${this.config.adAccountId}`;
  }

  private async uploadMedia(data: TwitterMediaData) {
    const iriPrefix = `media/upload`;
    const uploadClient = this.setupClient({
      ...this.config,
      subdomain: UPLOAD_API_SUBDOMAIN,
      version: UPLOAD_API_VERSION,
    });

    const media = (await httpClient(data.mediaUrl, { responseType: 'buffer' })).body;
    const mediaData = media.toString('base64');

    // @ref: https://developer.twitter.com/en/docs/media/upload-media/uploading-media/chunked-media-upload
    // 1. Initialize the upload using the INIT command
    let mediaResponse = await uploadClient.post(iriPrefix, {
      additional_owners: data.additionalOwnerIds.join(','),
      command: 'INIT',
      media_category: 'TWEET_IMAGE',
      media_type: mime.lookup(data.mediaUrl),
      total_bytes: media.byteLength,
    });
    // 2. Upload each chunk of bytes using the APPEND command
    await uploadClient.post(iriPrefix, {
      command: 'APPEND',
      media_data: mediaData,
      media_id: mediaResponse.media_id_string,
      segment_index: 0,
    });
    // 3. Complete the upload using the FINALIZE command
    mediaResponse = await uploadClient.post(iriPrefix, {
      command: 'FINALIZE',
      media_id: mediaResponse.media_id_string,
    });

    return mediaResponse;
  }
}
