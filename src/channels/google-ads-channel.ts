import * as path from 'path';
// @ts-ignore
import { AdwordsUser } from 'node-adwords';
import { CustomerInstance, enums, GoogleAdsApi, types } from 'google-ads-api';
import { DeepPartial } from 'ts-essentials';
import { MutateResourceOperation } from 'google-ads-api/build/types';
import { formatISO, parseISO } from 'date-fns';
import { sha256 } from 'js-sha256';
import { snakeCase } from 'change-case';

import Channel, { CustomAudienceUserData } from './channel';
import httpClient from '../utils/http-client';
import {
  GoogleAdGroupAdData,
  GoogleAdGroupCriteriaData,
  GoogleAdGroupData,
  // GoogleAdvertisingChannelType,
  GoogleBiddingStrategyConfig,
  GoogleBiddingStrategyType,
  GoogleCampaignBudgetData,
  GoogleCampaignCriteriaData,
  GoogleCampaignData,
  GoogleCampaignStatus,
  GoogleImageAssetsData,
  GoogleUserListData,
} from '../interfaces/google-ads';
import { convertMinorToMicroUnit } from '../utils/money-converter';
import { normalizeEmail } from '../utils/normalizer';
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
  loginCustomerId?: string;
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

interface GoogleUserListUserData extends CustomAudienceUserData {}

const ADWORDS_API_VERSION = 'v201809';

export class GoogleAdsChannel extends Channel {
  private client!: GoogleAdsApi;
  private customer!: CustomerInstance;
  protected defaultValues: GoogleAdsDefaultData = {};

  constructor(readonly id: string, private config?: GoogleAdsChannelConfig) {
    super(id);

    if (config && this.requiredConfigKeys.every(key => config[key])) {
      this.updateClient();
    }
  }

  private get requiredConfigKeys(): (keyof GoogleAdsChannelConfig)[] {
    return ['clientId', 'clientSecret', 'customerAccountId', 'developerToken', 'refreshToken'];
  }

  public async createAd(data: any) {
    if (!this.customer) {
      throw new Error('Channel has not been configured yet');
    }
    throw new Error('Not implemented yet');
  }

  public async createCampaign(data: GoogleAdsCampaignData) {
    if (!this.customer || !this.config?.customerAccountId) {
      throw new Error('Channel has not been configured yet');
    }
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
          name: `${data.name} - Budget - ${new Date().getTime()}`,
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

  public async updateCampaign(campaignResourceName: string, data: Partial<Omit<GoogleAdsCampaignData, 'adGroupAd'>>) {
    if (!this.customer) {
      throw new Error('Channel has not been configured yet');
    }

    this.getLogger()?.info(`Updating Campaign... -> ${campaignResourceName}`);

    const campaign = await this.customer.campaigns.get(campaignResourceName);
    // We only support for 1 Ad Group for now
    const [adGroup] = (
      await this.customer.adGroups.list({
        constraints: [
          {
            key: 'ad_group.campaign',
            op: '=',
            val: campaignResourceName,
          },
        ],
      })
    ).map(res => res.ad_group);

    const mutateResources: MutateResourceOperation[] = [];

    // WIP
    // if (data.adGroupAd) {
    //   mutateResources.push({
    //     ...this.composeAdGroupAdMutateResource({
    //       ...data.adGroupAd,
    //       adGroupResourceName: adGroup.resource_name as string,
    //       advertisingChannelType: getEnumString(
    //         'AdvertisingChannelType',
    //         campaign.advertising_channel_type as number,
    //       ) as GoogleAdvertisingChannelType,
    //       // imageAssetResourceNames: imageMutateResources.map(resource => resource.resource_name!),
    //       // squareImageAssetResourceNames: squareImageMutateResources.map(resource => resource.resource_name!),
    //     }),
    //     _resource: 'AdGroupAd',
    //   });
    // }

    if (data.adGroupCriteria) {
      // We are going to delete all and recreate them
      const adGroupCriteria = (
        await this.customer.adGroupCriteria.list({
          constraints: [
            {
              key: 'ad_group_criterion.ad_group',
              op: '=',
              val: adGroup.resource_name,
            },
          ],
        })
      ).map(res => res.ad_group_criterion);

      // Deletes all the ad group criteria
      mutateResources.push(
        ...adGroupCriteria.map<MutateResourceOperation>(adGroupCriterion => ({
          _operation: 'delete',
          _resource: 'AdGroupCriterion',
          resource_name: adGroupCriterion.resource_name,
        })),
      );

      // Recreates campaign criteria
      const adGroupCriterionMutateResources = await this.composeAdGroupCriterionMutateResources({
        ...data.adGroupCriteria,
        adGroupResourceName: adGroup.resource_name as string,
      });
      mutateResources.push(
        ...adGroupCriterionMutateResources.map(mutateResource => ({
          ...mutateResource,
          _resource: 'AdGroupCriterion',
        })),
      );
    }

    if (data.campaign) {
      mutateResources.push({
        ...this.composeCampaignMutateResource(data.campaign as GoogleCampaignData),
        _operation: 'update',
        _resource: 'Campaign',
        resource_name: campaignResourceName,
      });
    }

    if (data.campaignBudget) {
      mutateResources.push({
        ...this.composeCampaignBudgetMutateResource(data.campaignBudget as GoogleCampaignBudgetData),
        _operation: 'update',
        _resource: 'CampaignBudget',
        resource_name: campaign.campaign_budget,
      });
    }

    if (data.campaignCriteria) {
      // We are going to delete all and recreate them
      const campaignCriteria = (
        await this.customer.campaignCriteria.list({
          constraints: [
            {
              key: 'campaign_criterion.campaign',
              op: '=',
              val: campaignResourceName,
            },
          ],
        })
      ).map(res => res.campaign_criterion);

      // Deletes all the campaign criteria
      mutateResources.push(
        ...campaignCriteria.map<MutateResourceOperation>(campaignCriterion => ({
          _operation: 'delete',
          _resource: 'CampaignCriterion',
          resource_name: campaignCriterion.resource_name,
        })),
      );

      // Recreates campaign criteria
      const campaignCriterionMutateResources = await this.composeCampaignCriterionMutateResources({
        ...data.campaignCriteria,
        campaignResourceName,
      });
      mutateResources.push(
        ...campaignCriterionMutateResources.map(mutateResource => ({
          ...mutateResource,
          _resource: 'CampaignCriterion',
        })),
      );
    }

    if (data.name || data.status) {
      mutateResources.push({
        _operation: 'update',
        _resource: 'Campaign',
        name: data.name,
        resource_name: campaignResourceName,
        status: data.status ? enums.CampaignStatus[data.status] : undefined,
      });
    }

    await this.customer.mutateResources(mutateResources);

    this.getLogger()?.info(`Campaign has been updated successfully -> ${campaignResourceName}`);

    return campaignResourceName;
  }

  public async updateCampaignStatus(campaignResourceName: string, status: GoogleCampaignStatus) {
    if (!this.customer) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Updating Campaign status to ${status}... -> ${campaignResourceName}`);
    await this.customer.campaigns.update({
      resource_name: campaignResourceName,
      status: enums.CampaignStatus[status],
    });
    this.getLogger()?.info(`Campaign status has been updated successfully -> ${campaignResourceName}`);
    return campaignResourceName;
  }

  public async deleteCampaign(campaignResourceName: string) {
    if (!this.customer) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Deleting Campaign... -> ${campaignResourceName}`);
    await this.customer.campaigns.delete(campaignResourceName);
    this.getLogger()?.info(`Campaign has been deleted successfully -> ${campaignResourceName}`);
    return campaignResourceName;
  }

  public async createCustomAudience(data: GoogleUserListData) {
    if (!this.customer) {
      throw new Error('Channel has not been configured yet');
    }
    const userListData = this.composeUserListData(data);
    this.getLogger()?.info(userListData, `Creating User List...`);
    const response = await this.customer.userLists.create(userListData);
    const userListResourceName = response.results[0];
    this.getLogger()?.info(`User List has been created successfully -> ${userListResourceName}`);
    return userListResourceName;
  }

  public async createCustomAudienceUsers(userListId: string, data: GoogleUserListUserData) {
    if (!this.config || !this.requiredConfigKeys.every(key => this.config?.[key])) {
      throw new Error('Channel has not been configured yet');
    }
    this.getLogger()?.info(`Adding ${data.users.length} users to the User List...`);
    // TODO: Upgrade this to use Google Ads API instead of Adwords API
    const adwordsUser = new AdwordsUser({
      refresh_token: this.config.refreshToken,
      clientCustomerId: this.config.customerAccountId,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      developerToken: this.config.developerToken,
    });
    const userListService = adwordsUser.getService('AdwordsUserListService', ADWORDS_API_VERSION);
    const { userLists } = await new Promise((resolve, reject) => {
      userListService.mutateMembers(
        {
          operations: [
            {
              operator: 'ADD',
              operand: {
                userListId,
                membersList: data.users.map(user => ({
                  hashedEmail: sha256(normalizeEmail(user.email)),
                  hashedPhoneNumber: user.phone ? sha256(user.phone) : undefined,
                })),
              },
            },
          ],
        },
        (error: any, result: { userLists: any[] }) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );
    });
    this.getLogger()?.info(`${data.users.length} users have been added to the User List -> ${userListId}`);
    return userLists;
  }

  public async deleteCustomAudienceUsers(customAudienceId: string, data: GoogleUserListUserData) {
    if (!this.customer) {
      throw new Error('Channel has not been configured yet');
    }
    throw new Error('Not implemented yet');
  }

  public setConfig(config: Partial<GoogleAdsChannelConfig>) {
    Object.assign(this.config, config);
    if (this.config && this.requiredConfigKeys.every(key => this.config?.[key])) {
      this.updateClient();
    }
  }

  public setDefaultValues(defaultValues: GoogleAdsDefaultData) {
    this.defaultValues = defaultValues;
  }

  private composeAdGroupMutateResource(data: GoogleAdGroupData): types.AdGroup {
    let type;
    switch (data.advertisingChannelType) {
      case 'DISPLAY':
        type = enums.AdGroupType.DISPLAY_STANDARD;
        break;

      case 'SEARCH':
        type = enums.AdGroupType.SEARCH_STANDARD;
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
            call_to_action_text: data.callToActionText,
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
        ? this.getBiddingStrategyConfig(data.biddingStrategyConfig, data.biddingStrategyType)
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
        image_asset: { data: (await httpClient(imageUrl, { responseType: 'arraybuffer' })).data.toString('base64') },
        name: data.name || path.basename(imageUrl),
        type: enums.AssetType.IMAGE,
      })),
    );
  }

  private composeUserListData(data: GoogleUserListData): types.UserList {
    return {
      crm_based_user_list: {
        upload_key_type: enums.CustomerMatchUploadKeyType.CRM_ID,
      },
      access_reason: enums.AccessReason.OWNED,
      account_user_list_status: enums.UserListAccessStatus.ENABLED,
      description: data.description,
      membership_life_span: data.membershipLifeSpan, // 10000 = no expiration
      membership_status: enums.UserListMembershipStatus.OPEN,
      name: data.name,
      type: enums.UserListType.CRM_BASED,
    };
  }

  private getBiddingStrategyConfig(config: GoogleBiddingStrategyConfig, biddingStrategy: GoogleBiddingStrategyType) {
    switch (biddingStrategy) {
      case 'TARGET_SPEND':
        return {
          cpc_bid_ceiling_micros: config.cpcBidCeilingAmount
            ? convertMinorToMicroUnit(config.cpcBidCeilingAmount)
            : undefined,
        };

      case 'TARGET_IMPRESSION_SHARE':
        return {
          cpc_bid_ceiling_micros: config.cpcBidCeilingAmount
            ? convertMinorToMicroUnit(config.cpcBidCeilingAmount)
            : undefined,
          location: enums.TargetImpressionShareLocation.ANYWHERE_ON_PAGE,
          location_fraction_micros: 1000000, // 100%
        };

      default:
        return {};
    }
  }

  private updateClient() {
    if (!this.config || !this.requiredConfigKeys.every(key => this.config?.[key])) {
      throw new Error('Channel has not been configured yet');
    }
    this.client = new GoogleAdsApi({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      developer_token: this.config.developerToken,
    });
    this.customer = this.client.Customer({
      login_customer_id: this.config.loginCustomerId,
      customer_account_id: this.config.customerAccountId,
      refresh_token: this.config.refreshToken,
    });
  }
}
