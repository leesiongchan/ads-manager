import { CustomerInstance, enums, GoogleAdsApi, types } from 'google-ads-api';
import { DeepPartial } from 'ts-essentials';
import { formatISO, parseISO } from 'date-fns';
import { snakeCase } from 'change-case';

import Channel from './channel';
import httpClient from '../utils/http-client';
import {
  GoogleAdGroupAdData,
  GoogleAdGroupCriteriaData,
  GoogleAdGroupData,
  GoogleBiddingStrategyConfig,
  GoogleBiddingStrategyType,
  GoogleCampaignBudgetData,
  GoogleCampaignCriteriaData,
  GoogleCampaignData,
  GoogleCampaignStatus,
  GoogleImageAssetsData,
} from '../interfaces/google-ads';
import { convertMinorToMicroUnit } from '../utils/money-converter';
import { randomNumber } from '../utils/randomizer';

type GoogleAdsDefaultData = DeepPartial<
  Omit<GoogleAdsCampaignData, 'adGroupAd' | 'name' | 'status'> & {
    adGroupAd: Pick<GoogleAdsAdGroupAdData, 'businessName'>;
  }
>;

interface GoogleAdsChannelConfig {
  clientId: string;
  clientSecret: string;
  customerAccountId: string;
  developerToken: string;
  refreshToken: string;
}

interface GoogleAdsCampaignData {
  adGroupAd: GoogleAdsAdGroupAdData;
  adGroupCriteria?: Omit<GoogleAdGroupCriteriaData, 'adGroupResourceName'>;
  campaign: Omit<GoogleCampaignData, 'campaignBudgetResourceName' | 'name'>;
  campaignBudget: Omit<GoogleCampaignBudgetData, 'name'>;
  campaignCriteria?: Omit<GoogleCampaignCriteriaData, 'campaignResourceName'>;
  name: string;
  status: GoogleCampaignStatus;
}

interface GoogleAdsAdGroupAdData
  extends Omit<
    GoogleAdGroupAdData,
    'adGroupResourceName' | 'advertisingChannelType' | 'imageAssetResourceNames' | 'squareImageAssetResourceNames'
  > {
  imageUrls: string[];
  squareImageUrls: string[];
}

export class GoogleAdsChannel extends Channel {
  private client!: GoogleAdsApi;
  private customer!: CustomerInstance;
  protected defaultValues: GoogleAdsDefaultData = {};

  constructor(readonly id: string, private config: GoogleAdsChannelConfig) {
    super(id);

    this.updateClient();
  }

  public async createAd(data: any): Promise<any> {
    throw new Error('Not implemented yet');
  }

  public async createCampaign(data: GoogleAdsCampaignData): Promise<string> {
    const prefixResourceName = `customers/${this.config.customerAccountId.replace(/-/g, '')}`;
    let initialIndex = -randomNumber();
    const newCampaignBudgetId = initialIndex--;
    const newCampaignId = initialIndex--;
    const newAdGroupId = initialIndex--;

    this.getLogger()?.info(`Creating Campaign...`);

    // Preparing resources
    const mutateResources = await Promise.all([
      // 1. Prepare Campaign Criterion Mutate Resources
      this.composeCampaignCriterionMutateResources({
        ...this.defaultValues.campaignCriteria,
        ...data.campaignCriteria,
        campaignResourceName: `${prefixResourceName}/campaigns/${newCampaignId}`,
      }),
      // 2. Prepare Ad Group Criterion Mutate Resources
      this.composeAdGroupCriterionMutateResources({
        ...this.defaultValues.adGroupCriteria,
        ...data.adGroupCriteria,
        adGroupResourceName: `${prefixResourceName}/adGroups/${newAdGroupId}`,
      }),
      // 3. Prepare Image Asset Mutate Resources
      this.composeImageAssetMutateResources({ imageUrls: data.adGroupAd.imageUrls }),
      this.composeImageAssetMutateResources({ imageUrls: data.adGroupAd.squareImageUrls }),
    ]);
    const [campaignCriterionMutateResources, adGroupCriterionMutateResources] = mutateResources;
    let [, , imageMutateResources, squareImageMutateResources] = mutateResources;
    imageMutateResources = imageMutateResources.map(mutateResource => ({
      ...mutateResource,
      resource_name: `${prefixResourceName}/assets/${initialIndex--}`,
    }));
    squareImageMutateResources = squareImageMutateResources.map(mutateResource => ({
      ...mutateResource,
      resource_name: `${prefixResourceName}/assets/${initialIndex--}`,
    }));

    // Start creating resources...
    const response = await this.customer.mutateResources([
      // 1. Create Campaign Budget
      {
        ...this.composeCampaignBudgetMutateResource({
          ...this.defaultValues.campaignBudget,
          ...data.campaignBudget,
          name: `${data.name} - Budget`,
        }),
        _resource: 'CampaignBudget',
        resource_name: `${prefixResourceName}/campaignBudgets/${newCampaignBudgetId}`,
      },
      // 2. Create Campaign
      {
        ...this.composeCampaignMutateResource({
          ...this.defaultValues.campaign,
          ...data.campaign,
          campaignBudgetResourceName: `${prefixResourceName}/campaignBudgets/${newCampaignBudgetId}`,
          name: data.name,
        }),
        _resource: 'Campaign',
        resource_name: `${prefixResourceName}/campaigns/${newCampaignId}`,
        status: enums.CampaignStatus.PAUSED,
      },
      // 3. Create Campaign  Criteria
      ...campaignCriterionMutateResources.map(mutateResource => ({
        ...mutateResource,
        _resource: 'CampaignCriterion',
      })),
      // 4. Create Ad Group
      {
        ...this.composeAdGroupMutateResource({
          advertisingChannelType: data.campaign.advertisingChannelType,
          campaignResourceName: `${prefixResourceName}/campaigns/${newCampaignId}`,
          name: `${data.name} - Ad Group`,
        }),
        _resource: 'AdGroup',
        resource_name: `${prefixResourceName}/adGroups/${newAdGroupId}`,
      },
      // 5. Create Ad Group Criteria
      ...adGroupCriterionMutateResources.map(mutateResource => ({
        ...mutateResource,
        _resource: 'AdGroupCriterion',
      })),
      // 6. Create Image Assets
      ...imageMutateResources.map(mutateResource => ({
        ...mutateResource,
        _resource: 'Asset',
      })),
      // 7. Create Square Image assets
      ...squareImageMutateResources.map(mutateResource => ({
        ...mutateResource,
        _resource: 'Asset',
      })),
      // 8. Create Ad Group Ad
      {
        ...this.composeAdGroupAdMutateResource({
          ...this.defaultValues.adGroupAd,
          ...data.adGroupAd,
          adGroupResourceName: `${prefixResourceName}/adGroups/${newAdGroupId}`,
          advertisingChannelType: data.campaign.advertisingChannelType,
          imageAssetResourceNames: imageMutateResources.map(resource => resource.resource_name!),
          squareImageAssetResourceNames: squareImageMutateResources.map(resource => resource.resource_name!),
        }),
        _resource: 'AdGroupAd',
      },
      // 9. Update Campaign Status
      {
        _operation: 'update',
        _resource: 'Campaign',
        resource_name: `${prefixResourceName}/campaigns/${newCampaignId}`,
        status: enums.CampaignStatus[data.status] || enums.CampaignStatus.ENABLED,
      },
    ]);

    const campaignResourceName = response.results[response.results.length - 1];

    this.getLogger()?.info(`Campaign has been created successfully -> ${campaignResourceName}`);

    return campaignResourceName;
  }

  public async createCustomAudience(data: any) {
    throw new Error('Not implemented yet');
  }

  public async createCustomAudienceUsers(customAudienceId: string, data: any) {
    throw new Error('Not implemented yet');
  }

  public setDefaultValues(defaultValues: GoogleAdsDefaultData) {
    this.defaultValues = defaultValues;
  }

  private biddingStrategyConfigMapper(config: GoogleBiddingStrategyConfig, biddingStrategy: GoogleBiddingStrategyType) {
    switch (biddingStrategy) {
      case 'TARGET_SPEND':
        return { cpc_bid_ceiling_micros: config.cpcBidCeilingAmount };

      case 'TARGET_IMPRESSION_SHARE':
        return {
          cpc_bid_ceiling_micros: config.cpcBidCeilingAmount,
          location: enums.TargetImpressionShareLocation.ANYWHERE_ON_PAGE,
          location_fraction_micros: 1000000, // 100%
        };

      default:
        return {};
    }
  }

  private composeAdGroupMutateResource(data: GoogleAdGroupData): types.AdGroup {
    let type;
    switch (data.advertisingChannelType) {
      case 'DISPLAY':
        type = enums.AdGroupType.SEARCH_STANDARD;
        break;

      case 'SEARCH':
        type = enums.AdGroupType.DISPLAY_STANDARD;
        break;

      default:
        throw new Error('Other advertising channel types are not currently supported');
    }

    return {
      campaign: data.campaignResourceName,
      name: data.name,
      status: enums.AdGroupStatus.ENABLED,
      type,
    };
  }

  private composeAdGroupAdMutateResource(data: GoogleAdGroupAdData): types.AdGroupAd {
    // Required fields for AdGroupAd:
    // 1.  1 final_urls,
    // 2a. responsive_search_ad:
    //     3 headlines, 2 descriptions, 1 final_urls
    // 2b. responsive_display_ad:
    //     long_headline, business_name, 1 headline, 1 description, 1 marketing_image, 1 square_marketing_image
    let ad: types.Ad = {
      // display_url: data.url,
      final_urls: [data.url],
    };
    switch (data.advertisingChannelType) {
      case 'DISPLAY':
        ad = {
          ...ad,
          responsive_display_ad: {
            business_name: data.businessName,
            descriptions: data.descriptions.map(description => ({ text: description })),
            headlines: data.headlines.map(headline => ({ text: headline })),
            long_headline: { text: data.headlines[0] },
            marketing_images: data.imageAssetResourceNames.map(resourceName => ({ asset: resourceName })),
            square_marketing_images: data.squareImageAssetResourceNames.map(resourceName => ({
              asset: resourceName,
            })),
          },
          type: enums.AdType.RESPONSIVE_DISPLAY_AD,
        };
        break;

      case 'SEARCH':
        ad = {
          ...ad,
          responsive_search_ad: {
            descriptions: data.descriptions.map(description => ({ text: description })),
            headlines: data.headlines.map(headline => ({ text: headline })),
            path1: data.displayUrlPaths?.[0],
            path2: data.displayUrlPaths?.[1],
          },
          type: enums.AdType.RESPONSIVE_SEARCH_AD,
        };
        break;

      default:
        throw new Error('Other advertising channel types are not currently supported');
    }

    return {
      ad,
      ad_group: data.adGroupResourceName,
      status: enums.AdGroupAdStatus.ENABLED,
    };
  }

  private async composeAdGroupCriterionMutateResources(
    data: GoogleAdGroupCriteriaData,
  ): Promise<types.AdGroupCriterion[]> {
    let keywordCriterionMutateResources: types.AdGroupCriterion[] = [];
    if (data.keywords) {
      keywordCriterionMutateResources = data.keywords.map(keyword => ({
        keyword: { match_type: enums.KeywordMatchType.BROAD, text: keyword },
        type: enums.CriterionType.KEYWORD,
      }));
    }

    return [...keywordCriterionMutateResources].map(mutateResource => ({
      ...mutateResource,
      ad_group: data.adGroupResourceName,
      status: enums.AdGroupCriterionStatus.ENABLED,
    }));
  }

  private composeCampaignMutateResource(data: GoogleCampaignData): types.Campaign {
    return {
      [snakeCase(data.biddingStrategyType)]: data.biddingStrategyConfig
        ? this.biddingStrategyConfigMapper(data.biddingStrategyConfig, data.biddingStrategyType)
        : {},
      advertising_channel_type: enums.AdvertisingChannelType[data.advertisingChannelType],
      bidding_strategy_type: enums.BiddingStrategyType[data.biddingStrategyType],
      campaign_budget: data.campaignBudgetResourceName,
      end_date: data.endDate ? formatISO(parseISO(data.endDate), { representation: 'date' }) : undefined,
      name: data.name,
      start_date: formatISO(parseISO(data.startDate), { representation: 'date' }),
    };
  }

  private composeCampaignBudgetMutateResource(data: GoogleCampaignBudgetData): types.CampaignBudget {
    return {
      amount_micros: convertMinorToMicroUnit(data.dailyAmount),
      delivery_method: enums.BudgetDeliveryMethod.STANDARD,
      name: data.name,
      period: enums.BudgetPeriod.DAILY,
      status: enums.BudgetStatus.ENABLED,
      // total_amount_micros: convertMinorToMicroUnit(data.totalAmount),
      type: enums.BudgetType.STANDARD,
    };
  }

  private async composeCampaignCriterionMutateResources(
    data: GoogleCampaignCriteriaData,
  ): Promise<types.CampaignCriterion[]> {
    let languageCriterionMutateResources: types.CampaignCriterion[] = [];
    if (data.languageCodes) {
      const languageConstantResults = await this.customer.languageConstants.list({
        constraints: { 'language_constant.code': data.languageCodes },
        limit: data.languageCodes.length,
      });
      languageCriterionMutateResources = languageConstantResults.map(({ language_constant: result }) => ({
        language: { language_constant: result.resource_name },
        type: enums.CriterionType.LANGUAGE,
      }));
    }

    let locationCriterionMutateResources: types.CampaignCriterion[] = [];
    if (data.locationCountryCodes) {
      const geoTargetConstantResults = await this.customer.geoTargetConstants.list({
        constraints: { 'geo_target_constant.country_code': data.locationCountryCodes },
        limit: data.locationCountryCodes.length,
      });
      locationCriterionMutateResources = geoTargetConstantResults.map(({ geo_target_constant: result }) => ({
        location: { geo_target_constant: result.resource_name },
        type: enums.CriterionType.LOCATION,
      }));
    }

    return [...languageCriterionMutateResources, ...locationCriterionMutateResources].map(mutateResource => ({
      ...mutateResource,
      campaign: data.campaignResourceName,
      status: enums.CampaignCriterionStatus.ENABLED,
    }));
  }

  private composeImageAssetMutateResources(data: GoogleImageAssetsData): Promise<types.Asset[]> {
    return Promise.all(
      data.imageUrls.map(async imageUrl => ({
        image_asset: { data: (await httpClient(imageUrl, { responseType: 'buffer' })).body.toString('base64') },
        name: data.name,
        type: enums.AssetType.IMAGE,
      })),
    );
  }

  public setConfig(config: Partial<GoogleAdsChannelConfig>) {
    Object.assign(this.config, config);
    this.updateClient();
  }

  private updateClient() {
    this.client = new GoogleAdsApi({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      developer_token: this.config.developerToken,
    });
    this.customer = this.client.Customer({
      customer_account_id: this.config.customerAccountId,
      refresh_token: this.config.refreshToken,
    });
  }
}
