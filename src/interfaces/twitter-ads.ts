export type TwitterCampaignStatus = 'ACTIVE' | 'DRAFT' | 'PAUSED';

export interface TwitterCampaignData {
  name: string;
  totalBudget: number;
  dailyBudget: number;
  endTime: string;
  fundingInstrumentId: string;
  startTime: string;
  status: TwitterCampaignStatus;
}

export interface TwitterLineItemData {
  bidAmount: number;
  campaignId: string;
  name: string;
  status: TwitterCampaignStatus;
}

export interface TwitterMediaData {
  additionalOwnerIds: string[];
  mediaUrl: string;
}

export interface TwitterPromotedTweetData {
  lineItemId: string;
  tweetIds: string[];
}

export interface TwitterTailoredAudienceData {
  name: string;
}

export interface TwitterTargetingCriterionData {
  lineItemId: string;
  tailoredAudienceId: string;
}

export interface TwitterTweetData {
  asUserId: string;
  text: string;
  mediaKeys: string[];
}
