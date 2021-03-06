// @ts-ignore
import * as Twitter from 'twitter-lite';
import * as mime from 'mime-types';
import * as path from 'path';
import Fetch from 'cross-fetch';
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
  TwitterWebsiteCardData,
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
  // tailoredAudience?: TwitterTailoredAudienceData;
  tailoredAudienceId: string;
  tweet?: Omit<TwitterAdsTweetData, 'cardUri'>;
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
  protected defaultValues: TwitterAdsDefaultData = {};

  constructor(readonly id: string, private config?: TwitterAdsChannelConfig) {
    super(id);

    if (config && this.requiredConfigKeys.every(key => config[key])) {
      this.updateClient();
    }
  }

  private get requiredConfigKeys(): (keyof TwitterAdsChannelConfig)[] {
    return ['accessTokenKey', 'accessTokenSecret', 'adAccountId', 'consumerKey', 'consumerSecret'];
  }

  public async createAd(data: TwitterAdsTweetData) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    const mediaKeys = await Promise.all(
      data.mediaUrls.map(async (mediaUrl, index) => {
        this.getLogger()?.info(`Uploading media (${index + 1}/${data.mediaUrls.length})...`);
        const media = await this.uploadMedia({ additionalOwnerIds: [data.asUserId], mediaUrl });
        // Adds into `MediaLibrary`
        this.getLogger()?.info(`Adding media to Media Library (${index + 1}/${data.mediaUrls.length})...`);
        await this.twitterAdsClient.post(`${this.apiUrlPrefix}/media_library`, {
          file_name: path.basename(mediaUrl),
          media_category: 'TWEET_IMAGE',
          media_key: media.media_key,
        });
        return media.media_key;
      }),
    );

    let websiteCardUri;
    if (data.url) {
      const websiteCardData = this.composeWebsiteCard({
        mediaKey: mediaKeys[0],
        name: data.text,
        websiteTitle: data.headline || data.url,
        websiteUrl: data.url,
      });
      this.getLogger()?.info(websiteCardData, `Creating website card...`);
      const websiteCardResponse = await this.twitterAdsClient.post(
        `${this.apiUrlPrefix}/cards/website`,
        websiteCardData,
      );
      websiteCardUri = websiteCardResponse.data.card_uri;
    }

    const tweetData = this.composeTweetData({
      ...this.defaultValues.tweet,
      asUserId: data.asUserId,
      cardUri: websiteCardUri,
      text: data.text,
      mediaKeys,
    });
    this.getLogger()?.info(tweetData, `Creating tweet...`);
    const tweetResponse = await this.twitterAdsClient.post(`${this.apiUrlPrefix}/tweet`, tweetData);

    this.getLogger()?.info(`Tweet has been created successfully -> ${tweetResponse.data.id}`);

    return tweetResponse.data;
  }

  public async createCampaign(data: TwitterAdsCampaignData) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    if (!data.tweetId && !data.tweet) {
      throw new Error('`tweetId` or `tweet` is not defined');
    }
    if (!data.tailoredAudienceId) {
      throw new Error('`tailoredAudienceId` is not defined');
    }
    if (!(await this.isTailoredAudienceMinimumSizeMatched(data.tailoredAudienceId))) {
      throw new Error('The size of the Tailored Audience is too small');
    }

    // 1. Create a campaign and associate it with the funding instrument
    const campaignData = this.composeCampaignData({
      ...this.defaultValues.campaign,
      ...data.campaign,
      name: `${data.name} - Campaign`,
      status: 'ACTIVE',
    });
    this.getLogger()?.info(campaignData, `Creating Campaign...`);
    const { data: campaign } = await this.twitterAdsClient.post(`${this.apiUrlPrefix}/campaigns`, campaignData);

    // 2. Create a line item associated with the campaign
    const lineItemData = this.composeLineItemData({
      ...this.defaultValues.lineItem,
      ...data.lineItem,
      campaignId: campaign.id,
      name: `${data.name} - Group`,
      status: 'PAUSED',
    });
    this.getLogger()?.info(lineItemData, `Creating Line Item...`);
    const { data: lineItem } = await this.twitterAdsClient.post(`${this.apiUrlPrefix}/line_items`, lineItemData);

    // 3. Create a tweet (optional)
    let tweetId = data.tweetId;
    if (data.tweet) {
      const tweet = await this.createAd(data.tweet);
      tweetId = tweet.id_str;
    }

    // 4. Create a promoted tweet associated with the line item
    const promotedTweetData = this.composePromotedTweetData({
      lineItemId: lineItem.id,
      tweetIds: [tweetId!],
    });
    this.getLogger()?.info(promotedTweetData, `Creating Promoted Tweet...`);
    await this.twitterAdsClient.post(`${this.apiUrlPrefix}/promoted_tweets`, promotedTweetData);

    // Creating a new tailored audience is pointless since Twitter requires the size of tailored audience to have at least 100
    // 5. Create a tailored audience (optional)
    // let tailoredAudienceId = data.tailoredAudienceId;
    // if (data.tailoredAudience) {
    //   const tailoredAudience = await this.createCustomAudience(data.tailoredAudience);
    //   tailoredAudienceId = tailoredAudience.id;
    // }

    // 6. Create a targeting profile associated with the line item.
    const targetingCriterionData = this.composeTargetingCriterionData({
      lineItemId: lineItem.id,
      tailoredAudienceId: data.tailoredAudienceId,
    });
    this.getLogger()?.info(targetingCriterionData, `Creating Targeting Criterion...`);
    await this.twitterAdsClient.post(`${this.apiUrlPrefix}/targeting_criteria`, targetingCriterionData);

    // 7. Finally, un-pause the line item.
    this.getLogger()?.info(`Updating Line Item (${lineItem.id}) to ${data.status}...`);
    await this.twitterAdsClient.put(`${this.apiUrlPrefix}/line_items/${lineItem.id}`, {
      entity_status: data.status || 'ACTIVE',
    });

    this.getLogger()?.info(`Campaign has been created successfully -> ${campaign.id}`);

    return campaign;
  }

  public async updateCampaign(
    campaignId: string,
    data: Partial<Omit<TwitterAdsCampaignData, 'tailoredAudienceId' | 'tweet' | 'tweetId'>>,
  ) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }

    // We only support for 1 Line Item for now
    const {
      data: [lineItem],
    } = await this.twitterAdsClient.get(`${this.apiUrlPrefix}/line_items`, {
      campaign_ids: campaignId,
    });

    if (data.campaign) {
      const campaignData = this.composeCampaignData(data.campaign as any);
      this.getLogger()?.info(campaignData, `Updating Campaign... -> ${campaignId}`);
      await this.twitterAdsClient.put(`${this.apiUrlPrefix}/campaigns/${campaignId}`, campaignData);
    }

    if (data.lineItem) {
      const lineItemData = this.composeLineItemData(data.lineItem as any);
      this.getLogger()?.info(lineItemData, `Updating Line Item... -> ${lineItem.id}`);
      await this.twitterAdsClient.put(`${this.apiUrlPrefix}/line_items/${lineItem.id}`, lineItemData);
    }

    if (data.name || data.status) {
      const campaignData = {
        name: data.name,
        status: data.status,
      };
      this.getLogger()?.info(campaignData, `Updating Campaign name and status... -> ${campaignId}`);
      await this.twitterAdsClient.put(`${this.apiUrlPrefix}/campaigns/${campaignId}`, campaignData);
    }

    const { data: campaign } = await this.twitterAdsClient.get(`${this.apiUrlPrefix}/campaigns/${campaignId}`);

    this.getLogger()?.info(`Campaign has been updated successfully -> ${campaignId}`);

    return campaign;
  }

  public async updateCampaignStatus(campaignId: string, status: TwitterCampaignStatus) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Updating Campaign status to ${status}... -> ${campaignId}`);
    await this.twitterAdsClient.put(`${this.apiUrlPrefix}/campaigns/${campaignId}`, { status });
    this.getLogger()?.info(`Campaign status has been updated successfully -> ${campaignId}`);
    return campaignId;
  }

  public async deleteCampaign(campaignId: string) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    // TODO `twitter-lite` does not support delete method
    throw new Error('Not implemented yet');
  }

  public async createCustomAudience(data: TwitterTailoredAudienceData) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    const tailoredAudienceData = {
      name: data.name,
    };
    this.getLogger()?.info(tailoredAudienceData, `Creating Tailored Audience...`);
    const { data: tailoredAudience } = await this.twitterAdsClient.post(
      `${this.apiUrlPrefix}/tailored_audiences`,
      tailoredAudienceData,
    );
    this.getLogger()?.info(`Tailored Audience has been created successfully -> ${tailoredAudience.id}`);
    return tailoredAudience.data;
  }

  public async createCustomAudienceUsers(tailoredAudienceId: string, data: TwitterAdsTailoredAudienceUserData) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Adding ${data.users.length} users to the Tailored Audience...`);
    const { data: tailoredAudienceUsers } = await this.twitterAdsClient.postJSON(
      `${this.apiUrlPrefix}/tailored_audiences/${tailoredAudienceId}/users`,
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
    this.getLogger()?.info(
      `${data.users.length} users have been added to the Tailored Audience -> ${tailoredAudienceId}`,
    );
    return tailoredAudienceUsers;
  }

  public async deleteCustomAudienceUsers(tailoredAudienceId: string, data: TwitterAdsTailoredAudienceUserData) {
    if (!this.twitterAdsClient) {
      throw new Error('Channel has not been configured yet');
    }
    throw new Error('Not implemented yet');
  }

  public setConfig(config: Partial<TwitterAdsChannelConfig>) {
    Object.assign(this.config, config);
    if (this.config && this.requiredConfigKeys.every(key => this.config?.[key])) {
      this.updateClient();
    }
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
      tweet_ids: data.tweetIds.join(','),
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
      nullcast: true,
      text: data.text,
      ...(data.cardUri ? { card_uri: data.cardUri } : undefined),
    };
  }

  private composeWebsiteCard(data: TwitterWebsiteCardData) {
    return {
      media_key: data.mediaKey,
      name: data.name,
      website_title: data.websiteTitle,
      website_url: data.websiteUrl,
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
    // Little hack to force JSON request because the official lib doesn't not support
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
    if (!this.config || !this.requiredConfigKeys.every(key => this.config?.[key])) {
      throw new Error('Channel has not been configured yet');
    }
    this.twitterAdsClient = this.setupClient(this.config);
    this.apiUrlPrefix = `accounts/${this.config.adAccountId}`;
  }

  private async uploadMedia(data: TwitterMediaData) {
    if (!this.config || !this.requiredConfigKeys.every(key => this.config?.[key])) {
      throw new Error('Channel has not been configured yet');
    }
    const iriPrefix = `media/upload`;
    const uploadClient = this.setupClient({
      ...this.config,
      subdomain: UPLOAD_API_SUBDOMAIN,
      version: UPLOAD_API_VERSION,
    });

    const media = (await httpClient(data.mediaUrl, { responseType: 'arraybuffer' })).data;
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
